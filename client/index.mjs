import * as alt from 'alt'
import * as native from 'natives'

var Command;
(function (Command) {
    Command[Command["Initiate"] = 0] = "Initiate";
    Command[Command["Ping"] = 1] = "Ping";
    Command[Command["Pong"] = 2] = "Pong";
    Command[Command["StateUpdate"] = 3] = "StateUpdate";
    Command[Command["SelfStateUpdate"] = 4] = "SelfStateUpdate";
    Command[Command["PlayerStateUpdate"] = 5] = "PlayerStateUpdate";
    Command[Command["RemovePlayer"] = 6] = "RemovePlayer";
    Command[Command["PhoneCommunicationUpdate"] = 7] = "PhoneCommunicationUpdate";
    Command[Command["StopPhoneCommunication"] = 8] = "StopPhoneCommunication";
    Command[Command["RadioTowerUpdate"] = 9] = "RadioTowerUpdate";
    Command[Command["RadioCommunicationUpdate"] = 10] = "RadioCommunicationUpdate";
    Command[Command["StopRadioCommunication"] = 11] = "StopRadioCommunication";
    Command[Command["PlaySound"] = 12] = "PlaySound";
    Command[Command["StopSound"] = 13] = "StopSound";
})(Command || (Command = {}));
var PluginError;
(function (PluginError) {
    PluginError[PluginError["OK"] = 0] = "OK";
    PluginError[PluginError["InvalidJson"] = 1] = "InvalidJson";
    PluginError[PluginError["NotConnectedToServer"] = 2] = "NotConnectedToServer";
    PluginError[PluginError["AlreadyInGame"] = 3] = "AlreadyInGame";
    PluginError[PluginError["ChannelNotAvailable"] = 4] = "ChannelNotAvailable";
    PluginError[PluginError["NameNotAvailable"] = 5] = "NameNotAvailable";
    PluginError[PluginError["InvalidValue"] = 6] = "InvalidValue";
})(PluginError || (PluginError = {}));
var UpdateBranch;
(function (UpdateBranch) {
    UpdateBranch[UpdateBranch["Stable"] = 0] = "Stable";
    UpdateBranch[UpdateBranch["Testing"] = 1] = "Testing";
    UpdateBranch[UpdateBranch["PreBuild"] = 2] = "PreBuild";
})(UpdateBranch || (UpdateBranch = {}));
var RadioType;
(function (RadioType) {
    RadioType[RadioType["None"] = 1] = "None";
    RadioType[RadioType["ShortRange"] = 2] = "ShortRange";
    RadioType[RadioType["LongRange"] = 4] = "LongRange";
    RadioType[RadioType["Distributed"] = 8] = "Distributed";
    RadioType[RadioType["UltraShortRange"] = 16] = "UltraShortRange";
})(RadioType || (RadioType = {}));

let webView = new alt.WebView('http://resource/SaltyChat/SaltyWebSocket.html');
webView.unfocus();
webView.isVisible = false;

class PluginCommand {
    constructor(command, serverIdentifier, parameter) {
        this.Command = command;
        this.ServerUniqueIdentifier = serverIdentifier;
        this.Parameter = parameter;
    }
    Serialize() {
        return JSON.stringify(this);
    }
}
class GameInstance {
    constructor(serverIdentifier, name, channelId, channelPassword, soundPack) {
        this.ServerUniqueIdentifier = serverIdentifier;
        this.Name = name;
        this.ChannelId = channelId;
        this.ChannelPassword = channelPassword;
        this.SoundPack = soundPack;
    }
}
class PlayerState {
    constructor(name, position, rotation, voiceRange, isAlive, volumeOverride) {
        this.Name = name;
        this.Position = position;
        this.Rotation = rotation;
        this.VoiceRange = voiceRange;
        this.IsAlive = isAlive;
        this.VolumeOverride = volumeOverride;
    }
}
class PhoneCommunication {
    constructor(name, signalStrength, volume, direct, relayedBy) {
        this.Name = name;
        this.SignalStrength = signalStrength;
        this.Volume = volume;
        this.Direct = direct;
        this.RelayedBy = relayedBy;
    }
}
class RadioCommunication {
    constructor(name, senderRadioType, ownRadioType, playerMicClick, volume, direct, relayedBy) {
        this.Name = name;
        this.SenderRadioType = senderRadioType;
        this.OwnRadioType = ownRadioType;
        this.PlayMicClick = playerMicClick;
        this.Volume = volume;
        this.Direct = direct;
        this.RelayedBy = relayedBy;
    }
}
class RadioTower {
    constructor(towers) {
        this.Towers = towers;
    }
}
class Sound {
    constructor(filename, isLoop, handle) {
        this.Filename = filename;
        this.IsLoop = isLoop;
        this.Handle = handle;
    }
}
class VoiceClient {
    constructor(player, tsName, voiceRange, isAlive) {
        this.Player = player;
        this.TeamSpeakName = tsName;
        this.VoiceRange = voiceRange;
        this.IsAlive = isAlive;
    }
}
class VoiceManager {
    constructor() {
        this.IsEnabled = false;
        this.ServerUniqueIdentifier = null;
        this.SoundPack = null;
        this.IngameChannel = null;
        this.IngameChannelPassword = null;
        this.TeamSpeakName = null;
        this.VoiceRange = null;
        this.RadioChannel = null;
        this.IsTalking = false;
        this.IsMicrophoneMuted = false;
        this.IsSoundMuted = false;
        this.IsConnected = false;
        this.IsInGame = false;
        this.NextUpdate = Date.now();
        this.VoiceClients = new Map();
    }
    OnInitialize = (tsName, serverIdentifier, soundPack, ingameChannel, ingameChannelPassword) => {
        this.TeamSpeakName = tsName;
        this.ServerUniqueIdentifier = serverIdentifier;
        this.SoundPack = soundPack;
        this.IngameChannel = parseInt(ingameChannel);
        this.IngameChannelPassword = ingameChannelPassword;
        this.IsEnabled = true;
    }
    OnUpdateVoiceClient = (playerId, tsName, voiceRange) => {
        if (playerId == null)
        return;

        if (playerId == alt.Player.local.id) {
            let HudKeyValue = (voiceRange / VoiceManager.VoiceRanges[3]).toFixed(3)

            alt.emit('hud:SetKeyValue', 'voice', HudKeyValue);

            this.VoiceRange = voiceRange;
            
            alt.log("[Salty Chat] Voice Range: " + this.VoiceRange + "m");
        }
        else {

            if (this.VoiceClients.has(playerId)) {
                let voiceClient = this.VoiceClients.get(playerId);
                voiceClient.TeamSpeakName = tsName;
                voiceClient.VoiceRange = voiceRange;
            }
            else {
                let player = alt.Player.all.find(p => {
                    return (p.id == playerId);
                })
                if(player != undefined)
                    this.VoiceClients.set(playerId, new VoiceClient(player, tsName, voiceRange, true));
            }
        }
    }
    OnPlayerDisconnect = (playerId) => {
        if (this.VoiceClients.has(playerId)) {
            let voiceClient = this.VoiceClients.get(playerId);
            this.ExecuteCommand(new PluginCommand(Command.RemovePlayer, this.ServerUniqueIdentifier, new PlayerState(voiceClient.TeamSpeakName, null, null, null, false, null)));
            this.VoiceClients.delete(playerId);
        }
    }
    OnPlayerTalking = (player, isTalking) => {
        let target = alt.Player.local
        if (player !== alt.Player.local.id)
            target = alt.Player.all.find(p => {
                return (p.id == player)
            })
        if (isTalking)
            native.playFacialAnim(target.scriptID, "mic_chatter", "mp_facial")
        else
            native.playFacialAnim(target.scriptID, "mood_normal_1", "facials@gen_male@variations@normal")
    }
    OnPlayerDied = (playerHandle) => {
        let playerId = parseInt(playerHandle.id);
        if (this.VoiceClients.has(playerId)) {
            let voiceClient = this.VoiceClients.get(playerId);
            voiceClient.IsAlive = false;
        }
    }
    OnPlayerRevived = (playerHandle) => {
        let playerId = parseInt(playerHandle.id);
        if (this.VoiceClients.has(playerId)) {
            let voiceClient = this.VoiceClients.get(playerId);
            voiceClient.IsAlive = true;
        }
    }
    OnEstablishCall = (player) => {
        let playerId = parseInt(player.id);
        if (this.VoiceClients.has(playerId)) {
            let voiceClient = this.VoiceClients.get(playerId);
            let ownPosition = alt.Player.local.pos;
            let playerPosition = player.pos;
            this.ExecuteCommand(new PluginCommand(Command.PhoneCommunicationUpdate, this.ServerUniqueIdentifier, new PhoneCommunication(voiceClient.TeamSpeakName, native.getZoneScumminess(native.getZoneAtCoords(ownPosition.x, ownPosition.y, ownPosition.z)) +
                native.getZoneScumminess(native.getZoneAtCoords(playerPosition.x, playerPosition.y, playerPosition.z)), null, true, null)));
        }
    }
    OnEstablishCallRelayed = (player, direct, relayJson) => {
        let playerId = parseInt(player.id);
        let relays = JSON.parse(relayJson);
        if (this.VoiceClients.has(playerId)) {
            let voiceClient = this.VoiceClients.get(playerId);
            let ownPosition = alt.Player.local.pos;
            let playerPosition = player.pos;
            this.ExecuteCommand(new PluginCommand(Command.PhoneCommunicationUpdate, this.ServerUniqueIdentifier, new PhoneCommunication(voiceClient.TeamSpeakName, native.getZoneScumminess(native.getZoneAtCoords(ownPosition.x, ownPosition.y, ownPosition.z)) +
                native.getZoneScumminess(native.getZoneAtCoords(playerPosition.x, playerPosition.y, playerPosition.z)), null, direct, relays)));
       }
    }
    OnEndCall = (playerId) => {
        if (this.VoiceClients.has(playerId)) {
            let voiceClient = this.VoiceClients.get(playerId);
            this.ExecuteCommand(new PluginCommand(Command.StopPhoneCommunication, this.ServerUniqueIdentifier, new PhoneCommunication(voiceClient.TeamSpeakName, null, null, true, null)));
        }
    }
    OnSetRadioChannel = (radioChannel) => {
        if (typeof radioChannel === "string" && radioChannel != "") {
            this.RadioChannel = radioChannel;
            this.PlaySound("enterRadioChannel", false, "radio");
        }
        else {
            this.RadioChannel = null;
            this.PlaySound("leaveRadioChannel", false, "radio");
        }
    }
    OnPlayerIsSending = (playerHandle, isOnRadio) => {
        let playerId = parseInt(playerHandle.id);
        let player = playerHandle;
        if (player == alt.Player.local) {
            this.PlaySound("selfMicClick", false, "MicClick");
        }
        else if (this.VoiceClients.has(playerId)) {
            let voiceClient = this.VoiceClients.get(playerId);
            if (isOnRadio) {
                this.ExecuteCommand(new PluginCommand(Command.RadioCommunicationUpdate, this.ServerUniqueIdentifier, new RadioCommunication(voiceClient.TeamSpeakName, RadioType.LongRange | RadioType.Distributed, RadioType.LongRange | RadioType.Distributed, true, null, true, null)));
            }
            else {
                this.ExecuteCommand(new PluginCommand(Command.StopRadioCommunication, this.ServerUniqueIdentifier, new RadioCommunication(voiceClient.TeamSpeakName, RadioType.None, RadioType.None, true, null, true, null)));
            }
        }
    }
    OnPlayerIsSendingRelayed = (playerHandle, isOnRadio, stateChange, direct, relayJson) => {
        let playerId = parseInt(playerHandle.id);
        let relays = JSON.parse(relayJson);
        let player = playerHandle;
        if (player == alt.Player.local) {
            this.PlaySound("selfMicClick", false, "MicClick");
        }
        else if (this.VoiceClients.has(playerId)) {
            let voiceClient = this.VoiceClients.get(playerId);
            if (isOnRadio) {
                this.ExecuteCommand(new PluginCommand(Command.RadioCommunicationUpdate, this.ServerUniqueIdentifier, new RadioCommunication(voiceClient.TeamSpeakName, RadioType.LongRange | RadioType.Distributed, RadioType.LongRange | RadioType.Distributed, stateChange, null, direct, relays)));
            }
            else {
                this.ExecuteCommand(new PluginCommand(Command.StopRadioCommunication, this.ServerUniqueIdentifier, new RadioCommunication(voiceClient.TeamSpeakName, RadioType.None, RadioType.None, stateChange, null, true, null)));
            }
        }
    }
    OnUpdateRadioTowers = (radioTowerJson) => {
        let radioTowers = JSON.parse(radioTowerJson);
        this.ExecuteCommand(new PluginCommand(Command.RadioTowerUpdate, this.ServerUniqueIdentifier, new RadioTower(radioTowers)));
    }
    OnPluginConnected = () => {
        this.IsConnected = true;
        this.Initiate();
    }
    OnPluginDisconnected = () => {
        this.IsConnected = false;
    }
    OnPluginMessage = (messageJson) => {
        let message = JSON.parse(messageJson);
        if (message.ServerUniqueIdentifier != this.ServerUniqueIdentifier)
            return;
        if (message.Command == Command.Ping && this.NextUpdate + 1000 > Date.now()) {
            this.ExecuteCommand(new PluginCommand(Command.Pong, this.ServerUniqueIdentifier, null));
            return;
        }
        if (message.Parameter === typeof ('undefined') || message.Parameter == null)
            return;
        let parameter = message.Parameter;
        if (parameter.IsReady && !this.IsInGame) {
            alt.emitServer("SaltyChat_CheckVersion", parameter.UpdateBranch, parameter.Version);
            this.IsInGame = parameter.IsReady;
        }
        if (parameter.IsTalking != this.IsTalking) {
            this.IsTalking = parameter.IsTalking;
            alt.emitServer("SaltyChat_IsTalking", this.IsTalking);
        }
        if (parameter.IsMicrophoneMuted != this.IsMicrophoneMuted) {
            this.IsMicrophoneMuted = parameter.IsMicrophoneMuted;
        }
        if (parameter.IsSoundMuted != this.IsSoundMuted) {
            this.IsSoundMuted = parameter.IsSoundMuted;
        }
    }
    OnPluginError = (errorJson) => {
        try {
            let error = JSON.parse(errorJson);
            if (error.Error == PluginError.AlreadyInGame) {
                this.Initiate();
            }
            else {
                alt.log("[Salty Chat] Error: " + error.Error + " | Message: " + error.Message);
            }
        }
        catch {
            alt.log("[Salty Chat] We got an error, but couldn't deserialize it...");
        }
    }
    OnTick = () => {
        native.disableControlAction(1, 243, true);
        native.disableControlAction(1, 249, true);
        if (this.IsConnected && this.IsInGame && Date.now() > this.NextUpdate) {
            this.PlayerStateUpdate();
            this.NextUpdate = Date.now() + 666;
        }
        if (this.RadioChannel != null) {
            if (native.isDisabledControlJustPressed(1, 249))
                alt.emitServer("SaltyChat_IsSending", this.RadioChannel, true);
            else if (native.isDisabledControlJustReleased(1, 249))
                alt.emitServer("SaltyChat_IsSending", this.RadioChannel, false);
        }
        if (native.isDisabledControlJustPressed(0, 243)) {
            this.ToggleVoiceRange();
        }
    }
    PlaySound = (fileName, loop, handle) => {
        this.ExecuteCommand(new PluginCommand(Command.PlaySound, this.ServerUniqueIdentifier, new Sound(fileName, loop, handle)));
    }
    StopSound = (handle) => {
        this.ExecuteCommand(new PluginCommand(Command.StopSound, this.ServerUniqueIdentifier, new Sound(handle, false, handle)));
    }
    Initiate = () => {
        if(this.IsEnabled) {
            this.ExecuteCommand(new PluginCommand(Command.Initiate, this.ServerUniqueIdentifier, new GameInstance(this.ServerUniqueIdentifier, this.TeamSpeakName, this.IngameChannel, this.IngameChannelPassword, this.SoundPack)));
            alt.emitServer("SaltyChat_SetVoiceRange", alt.Player.local, 3)
        } else {
            alt.setTimeout(() => {
                this.Initiate()
            }, 500);
        }
    }
    PlayerStateUpdate = () => {
        let playerPosition = alt.Player.local.pos;
        this.VoiceClients.forEach((voiceClient, playerId) => {
            let nPlayerPosition = voiceClient.Player.pos;
            this.ExecuteCommand(new PluginCommand(Command.PlayerStateUpdate, this.ServerUniqueIdentifier, new PlayerState(voiceClient.TeamSpeakName, nPlayerPosition, null, voiceClient.VoiceRange, voiceClient.IsAlive, null)));
        });
        this.ExecuteCommand(new PluginCommand(Command.SelfStateUpdate, this.ServerUniqueIdentifier, new PlayerState(null, playerPosition, native.getGameplayCamRot(0).z, null, false, null)));
    }
    ToggleVoiceRange = () => {
        let index = VoiceManager.VoiceRanges.indexOf(this.VoiceRange);
        let newIndex = null
        if (index < 0)
            newIndex = 1
        else if (index + 1 >= VoiceManager.VoiceRanges.length)
            newIndex = 0;
        else
            newIndex = index + 1;

        alt.emitServer("SaltyChat_SetVoiceRange", VoiceManager.VoiceRanges[newIndex]);
    }
    ExecuteCommand = (command) => {
        if (this.IsEnabled && this.IsConnected) {
            webView.emit("salty:runCommand", JSON.stringify(command));
        }
    }
}
let voiceManager = new VoiceManager();
VoiceManager.VoiceRanges = [3.0, 8.0, 15.0, 32.0];


alt.onServer("SaltyChat_Initialize", voiceManager.OnInitialize); //(tsName, serverIdentifier, soundPack, ingameChannel, ingameChannelPassword));
alt.onServer("SaltyChat_UpdateClient", voiceManager.OnUpdateVoiceClient); //(playerHandle, tsName, voiceRange));
alt.onServer("SaltyChat_Disconnected", voiceManager.OnPlayerDisconnect); //(playerHandle));
alt.onServer("SaltyChat_IsTalking", voiceManager.OnPlayerTalking); //(playerHandle, isTalking));
alt.onServer("SaltyChat_PlayerDied", voiceManager.OnPlayerDied); //(playerHandle));
alt.onServer("SaltyChat_PlayerRevived", voiceManager.OnPlayerRevived); //(playerHandle));
alt.onServer("SaltyChat_EstablishedCall", voiceManager.OnEstablishCall); //(playerHandle));
alt.onServer("SaltyChat_EstablishedCallRelayed", voiceManager.OnEstablishCallRelayed); //(playerHandle, direct, relayJson));
alt.onServer("SaltyChat_EndCall", voiceManager.OnEndCall); //(playerHandle));
alt.onServer("SaltyChat_SetRadioChannel", voiceManager.OnSetRadioChannel); //(radioChannel));
alt.onServer("SaltyChat_IsSending", voiceManager.OnPlayerIsSending); //(playerHandle, isOnRadio));
alt.onServer("SaltyChat_IsSendingRelayed", voiceManager.OnPlayerIsSendingRelayed); //(playerHandle, isOnRadio, stateChange, direct, relayJson));
alt.onServer("SaltyChat_UpdateRadioTowers", voiceManager.OnUpdateRadioTowers); //(radioTowerJson));
webView.on("SaltyChat_OnDisconnected", voiceManager.OnPluginDisconnected); //());
webView.on("SaltyChat_OnMessage", voiceManager.OnPluginMessage); //(messageJson));
webView.on("SaltyChat_OnError", voiceManager.OnPluginError); //(errorJson));
webView.on("SaltyChat_OnConnected", voiceManager.OnPluginConnected); //());
alt.onServer("SaltyChat_OnDisconnected", voiceManager.OnPluginDisconnected); //());
alt.onServer("SaltyChat_OnMessage", voiceManager.OnPluginMessage); //(messageJson));
alt.onServer("SaltyChat_OnError", voiceManager.OnPluginError); //(errorJson));
alt.everyTick(() => {voiceManager.OnTick()});
