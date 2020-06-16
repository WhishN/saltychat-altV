import * as alt from 'alt'
import * as native from 'natives'

function LogConsole(string) {
	alt.log(string)
}

const Command = {
    Reset: -1,
    Initiate: 0,
    Ping: 1,
    Pong: 2,
    StateUpdate: 3,
    SelfStateUpdate: 4,
    PlayerStateUpdate: 5,
    RemovePlayer: 6,
    PhoneCommunicationUpdate: 7,
    StopPhoneCommunication: 8,
    RadioTowerUpdate: 9,
    RadioCommunicationUpdate: 10,
    StopRadioCommunication: 11,
    PlaySound: 12,
    StopSound: 13,
    BulkUpdate: 14,
    TalkStateChange: 15,
    MegaphoneCommunicationUpdate: 16,
    StopMegaphoneCommunication: 17
}

const PluginError = {
    OK: 0,
    InvalidJson: 1,
    NotConnectedToServer: 2,
    AlreadyInGame: 3,
    ChannelNotAvailable: 4,
    NameNotAvailable: 5,
    InvalidValue: 6,
}

const UpdateBranch = {
    Stable: 0,
    Testing: 1,
    PreBuild: 2,
}

const RadioType = {
    None: 1,
    ShortRange: 2,
    LongRange: 4,
    Distributed: 8,
    UltraShortRange: 16,
}

let webView = new alt.WebView('http://resource/Client/SaltyWebSocket.html');
webView.unfocus();

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
        this.SwissChannelIds = []
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
        this.Direct = true
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
    constructor()
    {
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
        this.VoiceClients = [];
        this.RadioTowers = [];
        this.VoiceRanges = [3, 8, 15, 32]
    }
    OnInitialize = (tsName, serverIdentifier, soundPack, ingameChannel, ingameChannelPassword) =>
    {
        this.TeamSpeakName = tsName;
        this.ServerUniqueIdentifier = serverIdentifier;
        this.SoundPack = soundPack;
        this.IngameChannel = parseInt(ingameChannel);
        this.IngameChannelPassword = ingameChannelPassword;
        this.IsEnabled = true;
    }
    OnUpdateVoiceClient = (playerId, tsName, voiceRange) =>
    {
        if(playerId == null) return;

        if(playerId == alt.Player.local.id)
        {
            alt.emit("hud:SetKeyValue", "voice", voiceRange)
            this.VoiceRange = voiceRange
            LogConsole("[Salty Chat] Voice Range: " + this.VoiceRange + "m");
        }
        else
        {
            let index = this.VoiceClients.findIndex(x => x.Player.id == playerId)
            if(index >= 0)
            {
                this.VoiceClients[index].TeamSpeakName = tsName;
                this.VoiceClients[index].voiceRange = voiceRange;
                LogConsole(`Updated Voice Client ${tsName}`)
            }
            else
            {
                let player = alt.Player.all.find(p => p.id == playerId);

                if(player != null) 
                {
                    this.VoiceClients.push(new VoiceClient(player, tsName, voiceRange, true));
                    LogConsole(`Added Voice Client ${tsName}`)
                }
            }
        }
    }

    OnPlayerDisconnect = (playerId) =>
    {
        let index = this.VoiceClients.findIndex(x => x.Player.id == playerId);
        if(index < 0) return;

        this.ExecuteCommand(new PluginCommand(Command.RemovePlayer, this.ServerUniqueIdentifier, new PlayerState(this.VoiceClients[index].TeamSpeakName, null, null, null, false, null)));
        LogConsole(`Removed Voice Client ${this.VoiceClients[index].TeamSpeakName}`)
        this.VoiceClients.splice(index, 1);
    }

    OnPlayerDied = (player) =>
    {
        let index = this.VoiceClients.findIndex(x => x.Player.id == player.id);
        if(index < 0) return;
		
		LogConsole(`Voice Client ${this.VoiceClients[index].TeamSpeakName} died`)

        this.VoiceClients[index].isAlive = false;
    }

    OnPlayerRevived = (player) =>
    {
        let index = this.VoiceClients.findIndex(x => x.Player.id == player.id);
        if(index < 0) return;
	
		LogConsole(`Voice Client ${this.VoiceClients[index].TeamSpeakName} revived`)

        this.VoiceClients[index].isAlive = true;
    }
    OnEstablishCall = (player) => 
    {
        let index = this.VoiceClients.findIndex(x => x.Player.id == player.id);
        if(index < 0) return;
		
		LogConsole(`Voice Client ${this.VoiceClients[index].TeamSpeakName} Call`)

        this.ExecuteCommand(new PluginCommand(Command.PhoneCommunicationUpdate, this.ServerUniqueIdentifier, new PhoneCommunication(this.VoiceClients[index].TeamSpeakName, 0, 1.4, true, null)));
    }
    OnEstablishCallRelayed = (player, direct, relayJson) =>
    {
        let index = this.VoiceClients.findIndex(x => x.Player.id == player.id);
        if(index < 0) return;

        let relays = JSON.parse(relayJson);
        let ownPosition = alt.Player.local.pos;
        let playerPosition = this.VoiceClients[index].Player.pos;

        this.ExecuteCommand(new PluginCommand(Command.PhoneCommunicationUpdate, this.ServerUniqueIdentifier, new PhoneCommunication(this.voiceClients[index].TeamSpeakName, 0, 1.4, direct, relays)));
    }
    OnEndCall = (playerId) => 
    {
        let index = this.VoiceClients.findIndex(x => x.Player.id == playerId);
        if(index < 0) return;

        this.ExecuteCommand(new PluginCommand(Command.StopPhoneCommunication, this.ServerUniqueIdentifier, new PhoneCommunication(this.voiceClients[index].TeamSpeakName, null, null, true, null)));
    }

    OnSetRadioChannel = (RadioChannel) => 
    {
        native.playSoundFrontend(-1, "CONFIRM_BEEP", "HUD_MINI_GAME_SOUNDSET", 1);
        this.RadioChannel = RadioChannel;
		LogConsole(`Set Radio Channel to ${RadioChannel}`)
    }

    OnPlayerIsSending = (playerId, isOnRadio, stateChange, OtherDirect = true, OtherVehicle = false) =>
    {
        if(playerId == alt.Player.local.id)
        {
            if(isOnRadio)
                native.playSoundFromEntity(-1, "Start_Squelch", alt.Player.local.scriptID, "CB_RADIO_SFX", true, undefined)
            else
                native.playSoundFromEntity(-1, "End_Squelch", alt.Player.local.scriptID, "CB_RADIO_SFX", true, undefined)
        }
        else
        {
            let index = this.VoiceClients.findIndex(x => x.Player.id == playerId);
            if(index < 0) return;

            if(isOnRadio)
            {
                let OwnType = (alt.Player.local.vehicle && RadioCars.includes(alt.Player.local.vehicle.model) ? RadioType.LongRange : RadioType.ShortRange) | (this.Direct ? 0 : RadioType.Distributed);

                let OtherType = (!OtherVehicle ? RadioType.ShortRange : RadioType.LongRange) | (OtherDirect ? 0 : RadioType.Distributed);

                LogConsole(`Funkverbindung: ME[${ownType}] - OTHER[${otherType}]`)

                native.playSoundFromEntity(-1, "Start_Squelch", voiceClient.Player.scriptID, "CB_RADIO_SFX", true, undefined)
                this.ExecuteCommand(new PluginCommand(Command.RadioCommunicationUpdate, this.ServerUniqueIdentifier, new RadioCommunication(this.VoiceClients[index].TeamSpeakName, OwnType, OtherType , false, null, true, null)))
            }
            else
            {
                native.playSoundFromEntity(-1, "End_Squelch", voiceClient.Player.scriptID, "CB_RADIO_SFX", true, undefined)
                this.ExecuteCommand(new PluginCommand(Command.StopRadioCommunication, this.ServerUniqueIdentifier, new RadioCommunication(this.VoiceClients[index].TeamSpeakName, RadioType.None, RadioType.None, false, null, true, null)))
            }
        }
    }

    OnPlayerIsSendingRelayed = (playerHandle, isOnRadio, stateChange, direct, relayJson) =>
    {
        // To Do
        LogConsole("This Function is to do");
    }

    OnUpdateRadioTowers = (RadioTowerJson) =>
    {
        this.RadioTowers = JSON.parse(RadioTowerJson);

        alt.setTimeout(() => {
            this.ExecuteCommand(new PluginCommand(Command.RadioTowerUpdate, this.ServerUniqueIdentifier, new RadioTower(this.RadioTowers)));
        }, 3000);
    }

    OnSetDirect = bool =>
    {
        this.Direct = bool;
    }

    OnPluginConnected = () =>
    {
        this.IsConnected = true;
        this.Initiate();
    }

    OnPluginDisconnected = () =>
    {
        this.IsConnected = false;
    }

    OnPluginMessage = (messageJson) => 
    {
        const message = JSON.parse(messageJson);

        if (message.ServerUniqueIdentifier != this.ServerUniqueIdentifier) return;
        if (message.Parameter == null && message.Command > 2) return;

        switch(message.Command) {
            case Command.Reset:
                this.IsInGame = false;
                this.Initiate();
                return;

            case Command.Ping:
                if(this.NextUpdate + 1000 < Date.now()) return;

                this.ExecuteCommand(new PluginCommand(Command.Pong, this.ServerUniqueIdentifier, null));
                return;

            case Command.StateUpdate:
                LogConsole("State Update");
                if(message.Parameter.IsReady && !this.IsInGame) {
                    alt.emitServer("SaltyChat_CheckVersion", message.Parameter.UpdateBranch, message.Parameter.Version);
                    this.IsInGame = message.Parameter.IsReady;
                }
                this.IsMicrophoneMuted = message.Parameter.IsMicrophoneMuted;
                this.IsSoundMuted = message.Parameter.IsSoundMuted;

                if (message.Parameter.IsTalking)
                    alt.emit('anim:playFacial', "mp_facial", "mic_chatter");
                else
                    alt.emit('anim:playFacial', "facials@gen_male@variations@normal", "mood_normal_1");
                return;

            case Command.TalkStateChange:
                LogConsole(`TalkStateChange :: ${message.Parameter.Name} {${message.Parameter.IsTalking}}`);
                let voiceClient = this.VoiceClients.find(x => x.TeamSpeakName == message.Parameter.Name);

                if(voiceClient == null) return;

                if(message.Parameter.IsTalking)
                    alt.emit('anim:playFacial', "mp_facial", "mic_chatter", voiceClient.Player)
                else
                    alt.emit('anim:playFacial', "facials@gen_male@variations@normal", "mood_normal_1", voiceClient.Player)
                return;
        }
    }

    OnPluginError = errorJson =>
    {
        try 
        {
            let error = JSON.parse(errorJson);
            if (error.Error == PluginError.AlreadyInGame)
                this.Initiate();
            else
                LogConsole("[Salty Chat] Error: " + error.Error + " | Message: " + error.Message); 
        }
        catch {
            LogConsole("[Salty Chat] We got an error, but couldn't deserialize it...");
            LogConsole("[Salty Chat] Json: " + errorJson);
        }
    }

    OnTick = () =>
    {
        native.disableControlAction(1, 243, true);
        native.disableControlAction(1, 249, true);
        if(this.IsConnected && this.IsInGame && Date.now() > this.NextUpdate) {
            this.PlayerStateUpdate();
            this.NextUpdate = Date.now() + 500;
        }

        let isInVehicle = (alt.Player.local.vehicle && RadioCars.includes(alt.Player.local.vehicle.model));

        if (native.isDisabledControlJustPressed(1, 249))
            alt.emitServer("SaltyChat_IsSending", this.RadioChannel, true, this.Direct, isInVehicle);
        else if (native.isDisabledControlJustReleased(1, 249))
            alt.emitServer("SaltyChat_IsSending", this.RadioChannel, false, this.Direct, isInVehicle);
        
        if (native.isDisabledControlJustPressed(0, 243)) {
            this.ToggleVoiceRange();
        }
    }

    PlaySound = (fileName, loop, handle) =>
    {
        this.ExecuteCommand(new PluginCommand(Command.PlaySound, this.ServerUniqueIdentifier, new Sound(fileName, loop, handle)));
    }
    StopSound = (handle) => 
    {
        this.ExecuteCommand(new PluginCommand(Command.StopSound, this.ServerUniqueIdentifier, new Sound(handle, false, handle)));
    }
    Initiate = () =>
    {
        if(this.IsEnabled)
        {
            this.ExecuteCommand(new PluginCommand(Command.Initiate, this.ServerUniqueIdentifier, new GameInstance(this.ServerUniqueIdentifier, this.TeamSpeakName, this.IngameChannel, this.IngameChannelPassword, this.SoundPack, this.SwissChannelIds)));
        }
        else
        {
            alt.setTimeout(() =>
            {
                this.Initiate();
            }, 500)
        }
    }
    PlayerStateUpdate = () =>
    {
        const VoiceClients = this.VoiceClients;
        let UpdatedPlayer = 0;
        let SkippedPlayer = [];
        for(let i = 0; i < VoiceClients.length; i++)
        {
            if(!VoiceClients[i].Player || VoiceClients[i].Player.scriptID == 0) 
            {
                try {
                    SkippedPlayer.push(VoiceClients[i].Player.Id)
                } catch(e) {}
                continue;
            }

            UpdatedPlayer++;

            let NoLoS = !native.hasEntityClearLosToEntity(alt.Player.local.scriptID, VoiceClients[i].Player.scriptID, 17);
            this.ExecuteCommand(new PluginCommand(Command.PlayerStateUpdate, this.ServerUniqueIdentifier, new PlayerState(VoiceClients[i].TeamSpeakName, VoiceClients[i].Player.pos, null, VoiceClients[i].VoiceRange, VoiceClients[i].IsAlive, 1.4, NoLoS)));
        }
        LogConsole(`Updated ${UpdatedPlayer}/${VoiceClients.length}`);
        LogConsole(`${SkippedPlayer}`)
        this.ExecuteCommand(new PluginCommand(Command.SelfStateUpdate, this.ServerUniqueIdentifier, new PlayerState(null, alt.Player.local.pos, native.getGameplayCamRot(0).z, null, false, null)));
    }
    ToggleVoiceRange = () =>
    {
        let index = this.VoiceRanges.indexOf(this.VoiceRange);

        if(++index >= this.VoiceRanges.length) index = 0;

        alt.emitServer("SaltyChat_SetVoiceRange", this.VoiceRanges[index]);
    }
    ExecuteCommand = (command) =>
    {
        if(!this.IsEnabled || !this.IsConnected) return;
        webView.emit("salty:runCommand", JSON.stringify(command))
    }
    OnEntityLeftStreamingRange = (entity) =>
    {
        if(!(entity instanceof alt.Player)) return;
        let voiceClient = this.VoiceClients.find(x => x.Player.id == entity.id);
        if(voiceClient == null) return;
        this.ExecuteCommand(new PluginCommand(Command.PlayerStateUpdate, this.ServerUniqueIdentifier, new PlayerState(voiceClient.TeamSpeakName, new alt.Vector3(0,0,0), null, voiceClient.VoiceRange, voiceClient.IsAlive, 1.4, false)));
    }
}
let voiceManager = new VoiceManager();

const RadioCars = [
    native.getHashKey('police2'),
    native.getHashKey('police3'),
    native.getHashKey('fbi'),
    native.getHashKey('policet'),
    native.getHashKey('policeb'),
    native.getHashKey('riot'),
    native.getHashKey('ambulance'),
    native.getHashKey('towtruck'),
    native.getHashKey('towtruck2'),
    native.getHashKey('firetruk'),
    native.getHashKey('flatbed'),
    native.getHashKey('utillitruck2'),
    native.getHashKey('utillitruck3'),
    native.getHashKey('taxi'),
    native.getHashKey('baller6'),
    native.getHashKey('police4')
]

alt.on('SaltyChat_setDirect', voiceManager.OnSetDirect);
alt.on('gameEntityDestroy', voiceManager.OnEntityLeftStreamingRange);
alt.onServer("SaltyChat_Initialize", voiceManager.OnInitialize); //(tsName, serverIdentifier, soundPack, ingameChannel, ingameChannelPassword));
alt.onServer("SaltyChat_UpdateClient", voiceManager.OnUpdateVoiceClient); //(playerHandle, tsName, voiceRange));
alt.onServer("SaltyChat_Disconnected", voiceManager.OnPlayerDisconnect); //(playerHandle));
//alt.onServer("SaltyChat_IsTalking", voiceManager.OnPlayerTalking); //(playerHandle, isTalking));
alt.onServer("SaltyChat_PlayerDied", voiceManager.OnPlayerDied); //(playerHandle));
alt.onServer("SaltyChat_PlayerRevived", voiceManager.OnPlayerRevived); //(playerHandle));
alt.onServer("SaltyChat_EstablishedCall", voiceManager.OnEstablishCall); //(playerHandle));
alt.onServer("SaltyChat_EstablishedCallRelayed", voiceManager.OnEstablishCallRelayed); //(playerHandle, direct, relayJson));
alt.onServer("SaltyChat_EndCall", voiceManager.OnEndCall); //(playerID));
alt.onServer("SaltyChat_SetRadioChannel", voiceManager.OnSetRadioChannel); //(radioChannel));
alt.onServer("SaltyChat_IsSending", voiceManager.OnPlayerIsSending); //(playerHandle, isOnRadio));
alt.onServer("SaltyChat_IsSendingRelayed", voiceManager.OnPlayerIsSendingRelayed); //(playerHandle, isOnRadio, stateChange, direct, relayJson));
alt.onServer("SaltyChat_UpdateRadioTowers", voiceManager.OnUpdateRadioTowers); //(radioTowerJson));
webView.on("SaltyChat_OnConnected", voiceManager.OnPluginConnected); //());
webView.on("SaltyChat_OnDisconnected", voiceManager.OnPluginDisconnected); //());
webView.on("SaltyChat_OnMessage", voiceManager.OnPluginMessage); //(messageJson));
webView.on("SaltyChat_OnError", voiceManager.OnPluginError); //(errorJson));
alt.onServer("SaltyChat_OnDisconnected", voiceManager.OnPluginDisconnected); //());
alt.onServer("SaltyChat_OnMessage", voiceManager.OnPluginMessage); //(messageJson));
alt.onServer("SaltyChat_OnError", voiceManager.OnPluginError); //(errorJson));
alt.everyTick(() => {voiceManager.OnTick()});
