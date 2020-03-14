using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;

namespace SaltyChatServer
{
    public class RadioChannel
    {
        #region Props/Fields
        internal string Name { get; }

        internal List<RadioChannelMember> Members { get; } = new List<RadioChannelMember>();
        #endregion

        #region CTOR
        internal RadioChannel(string name, params RadioChannelMember[] members)
        {
            this.Name = name;

            if (members != null)
                this.Members.AddRange(members);
        }
        #endregion

        #region Methods
        internal bool IsMember(VoiceClient voiceClient)
        {
            return this.Members.Any(m => m.VoiceClient == voiceClient);
        }

        internal void AddMember(VoiceClient voiceClient)
        {
            lock (this.Members)
            {
                if (!this.Members.Any(m => m.VoiceClient == voiceClient))
                {
                    this.Members.Add(new RadioChannelMember(this, voiceClient));

                    voiceClient.Player.Emit(Event.SaltyChat_SetRadioChannel, this.Name);

                    foreach (RadioChannelMember member in this.Members.Where(m => m.IsSending))
                    {
                        voiceClient.Player.Emit(Event.SaltyChat_IsSending, member.VoiceClient.Player.Id, true);
                    }
                }
            }
        }

        internal void RemoveMember(VoiceClient voiceClient)
        {
            lock (this.Members)
            {
                RadioChannelMember member = this.Members.FirstOrDefault(m => m.VoiceClient == voiceClient);

                if (member != null)
                {
                    if (member.IsSending)
                    {
                        if (member.VoiceClient.RadioSpeaker)
                        {
                            foreach (VoiceClient client in VoiceManager.VoiceClients.Values)
                            {
                                client.Player.Emit(Event.SaltyChat_IsSendingRelayed, voiceClient.Player.Id, false, true, false, "{}");
                            }
                        }
                        else
                        {
                            foreach (RadioChannelMember channelMember in this.Members)
                            {
                                channelMember.VoiceClient.Player.Emit(Event.SaltyChat_IsSending, voiceClient.Player.Id, false);
                            }
                        }
                    }

                    this.Members.Remove(member);
                    voiceClient.Player.Emit(Event.SaltyChat_SetRadioChannel, "");

                    foreach (RadioChannelMember channelMember in this.Members.Where(m => m.IsSending))
                    {
                        voiceClient.Player.Emit(Event.SaltyChat_IsSending, channelMember.VoiceClient.Player.Id, false);
                    }
                }
            }
        }

        internal void Send(VoiceClient voiceClient, bool isSending)
        {
            if (!this.TryGetMember(voiceClient, out RadioChannelMember radioChannelMember))
                return;

            bool stateChanged = radioChannelMember.IsSending != isSending;
            radioChannelMember.IsSending = isSending;

            List<RadioChannelMember> onSpeaker = this.Members.Where(m => m.VoiceClient.RadioSpeaker && m.VoiceClient != voiceClient).ToList();

            if (onSpeaker.Count > 0)
            {
                string[] channelMemberNames = onSpeaker.Select(m => m.VoiceClient.TeamSpeakName).ToArray();

                foreach (VoiceClient remoteClient in VoiceManager.VoiceClients.Values)
                {
                    remoteClient.Player.Emit(Event.SaltyChat_IsSendingRelayed, voiceClient.Player.Id, isSending, stateChanged, this.IsMember(remoteClient), JsonSerializer.Serialize<string[]>(channelMemberNames));
                }
            }
            else
            {
                foreach (RadioChannelMember member in this.Members)
                {
                    member.VoiceClient.Player.Emit(Event.SaltyChat_IsSending, voiceClient.Player.Id, isSending, stateChanged);
                }
            }
        }
        #endregion

        #region Helper
        internal bool TryGetMember(VoiceClient voiceClient, out RadioChannelMember radioChannelMember)
        {
            radioChannelMember = this.Members.FirstOrDefault(m => m.VoiceClient == voiceClient);

            return radioChannelMember != null;
        }
        #endregion
    }

    internal class RadioChannelMember
    {
        internal RadioChannel RadioChannel { get; }
        internal VoiceClient VoiceClient { get; }
        internal bool IsSending { get; set; }

        internal RadioChannelMember(RadioChannel radioChannel, VoiceClient voiceClient)
        {
            this.RadioChannel = radioChannel;
            this.VoiceClient = voiceClient;
        }
    }
}
