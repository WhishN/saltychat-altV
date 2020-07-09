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
            ServerUniqueIdentifier = SharedData.ServerUniqueIdentifier;
            RequiredUpdateBranch = SharedData.RequiredUpdateBranch;
            MinimumPluginVersion = SharedData.MinimumPluginVersion;
            SoundPack = SharedData.SoundPack;
            IngameChannel = SharedData.IngameChannel;
            IngameChannelPassword = SharedData.IngameChannelPassword;
        }

        [ServerEvent("PlayerLoggedIn")]
        public void OnPlayerConnected(IPlayer client, string playerName = "")
        {
            VoiceClient voiceClient = new VoiceClient(client, GetTeamSpeakName(), SharedData.VoiceRanges[0]);

            lock (VoiceClients)
            {
                VoiceClients.Add(client, voiceClient);
            }

            if (string.IsNullOrEmpty(playerName))
                playerName = voiceClient.TeamSpeakName;

            client.Emit(Event.SaltyChat_Initialize, playerName, ServerUniqueIdentifier, SoundPack, IngameChannel, IngameChannelPassword);
        }

        [ScriptEvent(ScriptEventType.PlayerDisconnect)]
        public void OnPlayerDisconnected(IPlayer client, string reason)
        {
            VoiceClient voiceClient;

            lock (VoiceClients)
            {
                if (!VoiceClients.TryGetValue(client, out voiceClient))
                    return;

                VoiceClients.Remove(client);
            }

            foreach (RadioChannel radioChannel in RadioChannels.Where(c => c.IsMember(voiceClient)))
            {
                radioChannel.RemoveMember(voiceClient);
            }

            foreach (VoiceClient cl in VoiceClients.Values)
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

            if (!TryGetVoiceClient(player, out VoiceClient voiceClient))
                return;

            if (!IsVersionAccepted(branch, version))
            {
                player.Kick($"[Salty Chat] Required Branch: {RequiredUpdateBranch} | Required Version: {MinimumPluginVersion}");
                return;
            }

            foreach (VoiceClient cl in VoiceClients.Values)
            {
                player.Emit(Event.SaltyChat_UpdateClient, cl.Player.Id, cl.TeamSpeakName, cl.VoiceRange);

            }

            Alt.EmitAllClients(Event.SaltyChat_UpdateClient, voiceClient.Player.Id, voiceClient.TeamSpeakName, voiceClient.VoiceRange);
        }

        [ClientEvent(Event.SaltyChat_IsTalking)]
        public void OnIsTalking(IPlayer player, bool isTalking)
        {
            if (!TryGetVoiceClient(player, out _))
                return;

            foreach (VoiceClient client in VoiceClients.Values)
            {
                client.Player.Emit(Event.SaltyChat_IsTalking, player.Id, isTalking);
            }
        }

        [ServerEvent(Event.SaltyChat_SetVoiceRange)]
        public void OnSetVoiceRange(IPlayer player, string range)
        {
            float voiceRange;

            voiceRange = 8.0f;

            if (range == "Weit")
                voiceRange = 22.0f;

            else if (range == "Kurz")
                voiceRange = 2.0f;

            Console.WriteLine("VOICE RANGE TEST: " + voiceRange);

            if (!TryGetVoiceClient(player, out VoiceClient voiceClient))
                return;

            voiceClient.VoiceRange = voiceRange;

            foreach (VoiceClient client in VoiceClients.Values)
            {
                client.Player.Emit(Event.SaltyChat_UpdateClient, player.Id, voiceClient.TeamSpeakName, voiceClient.VoiceRange);
            }
        }
        #endregion

        #region Commands (Radio)
        //#if DEBUG
        [ClientEvent("speaker")]
        public void OnSetRadioSpeaker(IPlayer player, string toggleString)
        {
            bool toggle = string.Equals(toggleString, "true", StringComparison.OrdinalIgnoreCase);

            SetRadioSpeaker(player, toggle);

            //player.SendChatMessage("Speaker", $"The speaker is now {(toggle ? "on" : "off")}.");
        }

        [ClientEvent("joinradio")]
        public void OnJoinRadioChannel(IPlayer player, string channelName)
        {
            JoinRadioChannel(player, channelName);

            //player.SendChatMessage("Radio", $"You joined channel \"{channelName}\".");
        }

        [ClientEvent("leaveradio")]
        public void OnLeaveRadioChannel(IPlayer player, string channelName)
        {
            LeaveRadioChannel(player, channelName);

            //player.SendChatMessage("Radio", $"You left channel \"{channelName}\".");
        }
        //#endif
        #endregion

        #region Remote Events (Radio)
        [ClientEvent(Event.SaltyChat_IsSending)]
        public void OnSendingOnRadio(IPlayer player, string radioChannelName, bool isSending)
        {
            if (!TryGetVoiceClient(player, out VoiceClient voiceClient))
                return;

            RadioChannel radioChannel = GetRadioChannel(radioChannelName, false);

            if (radioChannel == null || !radioChannel.IsMember(voiceClient))
                return;

            radioChannel.Send(voiceClient, isSending);
        }
        #endregion

        #region Methods (Radio)
        public static RadioChannel GetRadioChannel(string name, bool create)
        {
            RadioChannel radioChannel;

            lock (RadioChannels)
            {
                radioChannel = RadioChannels.FirstOrDefault(r => r.Name == name);

                if (radioChannel == null && create)
                {
                    radioChannel = new RadioChannel(name);

                    RadioChannels.Add(radioChannel);
                }
            }

            return radioChannel;
        }

        public static void SetRadioSpeaker(IPlayer player, bool toggle)
        {
            if (!TryGetVoiceClient(player, out VoiceClient voiceClient))
                return;

            voiceClient.RadioSpeaker = toggle;
        }

        public static void JoinRadioChannel(IPlayer player, string radioChannelName)
        {
            if (!TryGetVoiceClient(player, out VoiceClient voiceClient))
                return;

            foreach (RadioChannel channel in RadioChannels)
            {
                if (channel.IsMember(voiceClient))
                    return;
            }

            RadioChannel radioChannel = GetRadioChannel(radioChannelName, true);

            radioChannel.AddMember(voiceClient);
        }

        public static void LeaveRadioChannel(IPlayer player)
        {
            if (!TryGetVoiceClient(player, out VoiceClient voiceClient))
                return;

            foreach (RadioChannel radioChannel in RadioChannels.Where(r => r.IsMember(voiceClient)))
            {
                LeaveRadioChannel(player, radioChannel.Name);
            }
        }

        public static void LeaveRadioChannel(IPlayer player, string radioChannelName)
        {
            if (!TryGetVoiceClient(player, out VoiceClient voiceClient))
                return;

            RadioChannel radioChannel = GetRadioChannel(radioChannelName, false);

            if (radioChannel != null)
            {
                radioChannel.RemoveMember(voiceClient);

                if (radioChannel.Members.Count == 0)
                {
                    RadioChannels.Remove(radioChannel);
                }
            }
        }

        public static void SendingOnRadio(IPlayer player, string radioChannelName, bool isSending)
        {
            if (!TryGetVoiceClient(player, out VoiceClient voiceClient))
                return;

            RadioChannel radioChannel = GetRadioChannel(radioChannelName, false);

            if (radioChannel == null || !radioChannel.IsMember(voiceClient))
                return;

            radioChannel.Send(voiceClient, isSending);
        }
        #endregion

        #region Methods
        internal static string GetTeamSpeakName()
        {
            string name;

            lock (VoiceClients)
            {
                do
                {
                    name = Guid.NewGuid().ToString().Replace("-", "");

                    if (name.Length > 30)
                    {
                        name = name.Remove(29, name.Length - 30);
                    }
                }
                while (VoiceClients.Values.Any(c => c.TeamSpeakName == name));
            }

            return name;
        }

        public static bool IsVersionAccepted(string branch, string version)
        {
            if (!string.IsNullOrWhiteSpace(RequiredUpdateBranch) && RequiredUpdateBranch != branch)
            {
                return false;
            }

            if (!string.IsNullOrWhiteSpace(MinimumPluginVersion))
            {
                try
                {
                    string[] minimumVersionArray = MinimumPluginVersion.Split('.');
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
            lock (VoiceClients)
            {
                if (VoiceClients.TryGetValue(client, out voiceClient))
                    return true;
            }

            voiceClient = null;
            return false;
        }
        #endregion
    }
}
