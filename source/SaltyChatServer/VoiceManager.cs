using System;
using System.Collections.Generic;
using System.Linq;
using System.Numerics;
using AltV.Net;
using AltV.Net.Elements.Entities;

namespace SaltyChatServer
{
    public class VoiceManager : IScript
    {
        #region Properties
        public static string ServerUniqueIdentifier { get; private set; }
        public static string RequiredUpdateBranch { get; private set; }
        public static string MinimumPluginVersion { get; private set; }
        public static string SoundPack { get; private set; }
        public static string IngameChannel { get; private set; }
        public static string IngameChannelPassword { get; private set; }

        public static Vector3[] RadioTowers { get; private set; } = new Vector3[]
        {
            new Vector3(552.8169f, -27.8083f, 94.87936f),
            new Vector3(758.5276f, 1273.74f, 360.2965f),
            new Vector3(1857.389f, 3694.529f, 38.9618f),
            new Vector3(-448.2019f, 6019.807f, 36.62916f)
        };

        internal static Dictionary<IPlayer, VoiceClient> VoiceClients { get; private set; } = new Dictionary<IPlayer, VoiceClient>();

        private static List<RadioChannel> RadioChannels { get; set; } = new List<RadioChannel>();
        #endregion

        #region Server Events
        [ServerEvent("StartServer")]
        public void StartServer()
        {
            VoiceManager.ServerUniqueIdentifier = SharedData.ServerUniqueIdentifier;
            VoiceManager.RequiredUpdateBranch = SharedData.RequiredUpdateBranch;
            VoiceManager.MinimumPluginVersion = SharedData.MinimumPluginVersion;
            VoiceManager.SoundPack = SharedData.SoundPack;
            VoiceManager.IngameChannel = SharedData.IngameChannel;
            VoiceManager.IngameChannelPassword = SharedData.IngameChannelPassword;
        }

        [ServerEvent("PlayerLoggedIn")]
        public void OnPlayerLoggedIn(IPlayer client, string playerName = "")
        {
            var tsName = VoiceManager.GetTeamSpeakName();
            
            VoiceClient voiceClient;
            
            if (String.IsNullOrEmpty(playerName))
                voiceClient = new VoiceClient(client, tsName, SharedData.VoiceRanges[0]);
            else
            {
                var checkname = VoiceManager.VoiceClients.Values.FirstOrDefault(x => x.TeamSpeakName == playerName);
                if (checkname == null)
                    voiceClient = new VoiceClient(client, playerName, SharedData.VoiceRanges[0]);
                else
                    voiceClient = new VoiceClient(client, tsName, SharedData.VoiceRanges[0]);
            }

            lock (VoiceManager.VoiceClients)
            {
                VoiceManager.VoiceClients.Add(client, voiceClient);
            }

            client.Emit(Event.SaltyChat_Initialize, voiceClient.TeamSpeakName, VoiceManager.ServerUniqueIdentifier, VoiceManager.SoundPack, VoiceManager.IngameChannel, VoiceManager.IngameChannelPassword);
        
            //Console.WriteLine($"{client} connected");
        }

        [ScriptEvent(ScriptEventType.PlayerDisconnect)]
        public void OnPlayerDisconnected(IPlayer client, string reason)
        {
            VoiceClient voiceClient;

            lock (VoiceManager.VoiceClients)
            {
                if (!VoiceManager.VoiceClients.TryGetValue(client, out voiceClient))
                    return;

                VoiceManager.VoiceClients.Remove(client);
            }

            foreach (RadioChannel radioChannel in VoiceManager.RadioChannels.Where(c => c.IsMember(voiceClient)))
            {
                radioChannel.RemoveMember(voiceClient);
            }

            foreach (VoiceClient cl in VoiceManager.VoiceClients.Values)
            {
                cl.Player.Emit(Event.SaltyChat_Disconnected, voiceClient.Player.Id);
            }
        }
        #endregion

        #region Remote Events
        [ClientEvent(Event.SaltyChat_CheckVersion)]
        public void OnCheckVersion(IPlayer player, string branch, string version)
        {
            Console.WriteLine($"Checked Version for Player #{player.Id}");

            if (!VoiceManager.TryGetVoiceClient(player, out VoiceClient voiceClient))
                return;


            if (!VoiceManager.IsVersionAccepted(branch, version))
            {
                player.Kick($"[Salty Chat] Required Branch: {VoiceManager.RequiredUpdateBranch} | Required Version: {VoiceManager.MinimumPluginVersion}");
                return;
            }

            foreach (VoiceClient cl in VoiceManager.VoiceClients.Values)
            {
                player.Emit(Event.SaltyChat_UpdateClient, cl.Player.Id, cl.TeamSpeakName, cl.VoiceRange);
            }

            Alt.EmitAllClients(Event.SaltyChat_UpdateClient, voiceClient.Player.Id, voiceClient.TeamSpeakName, voiceClient.VoiceRange);
        }

        [ClientEvent(Event.SaltyChat_IsTalking)]
        public void OnIsTalking(IPlayer player, bool isTalking)
        {
            if (!VoiceManager.TryGetVoiceClient(player, out VoiceClient voiceClient))
                return;

            foreach (VoiceClient client in VoiceManager.VoiceClients.Values)
            {
                client.Player.Emit(Event.SaltyChat_IsTalking, player.Id, isTalking);
            }
        }

        [ClientEvent(Event.SaltyChat_SetVoiceRange)]
        public void OnSetVoiceRange(IPlayer player, int range)
        {
            float voiceRange = (float) range;
            if (!VoiceManager.TryGetVoiceClient(player, out VoiceClient voiceClient))
                return;

            //Console.WriteLine("Set Voice Range for Player");

            if (Array.IndexOf(SharedData.VoiceRanges, voiceRange) >= 0)
            {
                voiceClient.VoiceRange = voiceRange;

                foreach (VoiceClient client in VoiceManager.VoiceClients.Values)
                {
                    client.Player.Emit(Event.SaltyChat_UpdateClient, player.Id, voiceClient.TeamSpeakName, voiceClient.VoiceRange);
                }
            }
        }
        #endregion

        #region Commands (Radio)
        //#if DEBUG
        [ClientEvent("speaker")]
        public void OnSetRadioSpeaker(IPlayer player, string toggleString)
        {
            bool toggle = String.Equals(toggleString, "true", StringComparison.OrdinalIgnoreCase);

            VoiceManager.SetRadioSpeaker(player, toggle);

            //player.SendChatMessage("Speaker", $"The speaker is now {(toggle ? "on" : "off")}.");
        }

        [ClientEvent("joinradio")]
        public void OnJoinRadioChannel(IPlayer player, string channelName)
        {
            VoiceManager.JoinRadioChannel(player, channelName);

            //player.SendChatMessage("Radio", $"You joined channel \"{channelName}\".");
        }

        [ClientEvent("leaveradio")]
        public void OnLeaveRadioChannel(IPlayer player, string channelName)
        {
            VoiceManager.LeaveRadioChannel(player, channelName);

            //player.SendChatMessage("Radio", $"You left channel \"{channelName}\".");
        }
        //#endif
        #endregion

        #region Remote Events (Radio)
        [ClientEvent(Event.SaltyChat_IsSending)]
        public void OnSendingOnRadio(IPlayer player, string radioChannelName, bool isSending)
        {
            if (!VoiceManager.TryGetVoiceClient(player, out VoiceClient voiceClient))
                return;

            RadioChannel radioChannel = VoiceManager.GetRadioChannel(radioChannelName, false);

            if (radioChannel == null || !radioChannel.IsMember(voiceClient))
                return;

            radioChannel.Send(voiceClient, isSending);
        }
        #endregion

        #region Methods (Radio)
        public static RadioChannel GetRadioChannel(string name, bool create)
        {
            RadioChannel radioChannel;

            lock (VoiceManager.RadioChannels)
            {
                radioChannel = VoiceManager.RadioChannels.FirstOrDefault(r => r.Name == name);

                if (radioChannel == null && create)
                {
                    radioChannel = new RadioChannel(name);

                    VoiceManager.RadioChannels.Add(radioChannel);
                }
            }

            return radioChannel;
        }

        public static void SetRadioSpeaker(IPlayer player, bool toggle)
        {
            if (!VoiceManager.TryGetVoiceClient(player, out VoiceClient voiceClient))
                return;

            voiceClient.RadioSpeaker = toggle;
        }

        public static void JoinRadioChannel(IPlayer player, string radioChannelName)
        {
            if (!VoiceManager.TryGetVoiceClient(player, out VoiceClient voiceClient))
                return;

            foreach (RadioChannel channel in VoiceManager.RadioChannels)
            {
                if (channel.IsMember(voiceClient))
                    return;
            }

            RadioChannel radioChannel = VoiceManager.GetRadioChannel(radioChannelName, true);

            radioChannel.AddMember(voiceClient);
        }

        public static void LeaveRadioChannel(IPlayer player)
        {
            if (!VoiceManager.TryGetVoiceClient(player, out VoiceClient voiceClient))
                return;

            foreach (RadioChannel radioChannel in VoiceManager.RadioChannels.Where(r => r.IsMember(voiceClient)))
            {
                VoiceManager.LeaveRadioChannel(player, radioChannel.Name);
            }
        }

        public static void LeaveRadioChannel(IPlayer player, string radioChannelName)
        {
            if (!VoiceManager.TryGetVoiceClient(player, out VoiceClient voiceClient))
                return;

            RadioChannel radioChannel = VoiceManager.GetRadioChannel(radioChannelName, false);

            if (radioChannel != null)
            {
                radioChannel.RemoveMember(voiceClient);

                if (radioChannel.Members.Count == 0)
                {
                    VoiceManager.RadioChannels.Remove(radioChannel);
                }
            }
        }

        public static void SendingOnRadio(IPlayer player, string radioChannelName, bool isSending)
        {
            if (!VoiceManager.TryGetVoiceClient(player, out VoiceClient voiceClient))
                return;

            RadioChannel radioChannel = VoiceManager.GetRadioChannel(radioChannelName, false);

            if (radioChannel == null || !radioChannel.IsMember(voiceClient))
                return;

            radioChannel.Send(voiceClient, isSending);
        }
        #endregion

        #region Methods
        internal static string GetTeamSpeakName()
        {
            string name;

            lock (VoiceManager.VoiceClients)
            {
                do
                {
                    name = Guid.NewGuid().ToString().Replace("-", "");

                    if (name.Length > 30)
                    {
                        name = name.Remove(29, name.Length - 30);
                    }
                }
                while (VoiceManager.VoiceClients.Values.Any(c => c.TeamSpeakName == name));
            }

            return name;
        }

        public static bool IsVersionAccepted(string branch, string version)
        {
            if (!String.IsNullOrWhiteSpace(VoiceManager.RequiredUpdateBranch) && VoiceManager.RequiredUpdateBranch != branch)
            {
                return false;
            }

            if (!String.IsNullOrWhiteSpace(VoiceManager.MinimumPluginVersion))
            {
                try
                {
                    string[] minimumVersionArray = VoiceManager.MinimumPluginVersion.Split('.');
                    string[] versionArray = version.Split('.');

                    int lengthCounter = 0;

                    if (versionArray.Length >= minimumVersionArray.Length)
                    {
                        lengthCounter = minimumVersionArray.Length;
                    }
                    else
                    {
                        lengthCounter = versionArray.Length;
                    }

                    for (int i = 0; i < lengthCounter; i++)
                    {
                        int min = Convert.ToInt32(minimumVersionArray[i]);
                        int cur = Convert.ToInt32(versionArray[i]);

                        if (cur > min)
                        {
                            return true;
                        }
                        else if (min > cur)
                        {
                            return false;
                        }
                    }
                }
                catch
                {
                    return false;
                }
            }

            return true;
        }
        #endregion

        #region Helper
        public static bool TryGetVoiceClient(IPlayer client, out VoiceClient voiceClient)
        {
            lock (VoiceManager.VoiceClients)
            {
                if (VoiceManager.VoiceClients.TryGetValue(client, out voiceClient))
                    return true;
            }

            voiceClient = null;
            return false;
        }
        #endregion
    }
}
