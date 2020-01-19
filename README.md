# saltychat-altV
alt:V Version of Saltychat Plugin using C# Serverside

Fill in Serverside required Settings, compile the Serverside and add it to your server

For alt:V Specific Questions consider asking in [alt:V Discord](https://dscrd.in/altVMP)

How To Enable the Plugin on Connect:

This implementation needs an emit from Server and from saltychat.dll

If you use Javascript Serverside you need to emit 2 things:

```javascript
// Only after both Functions are emitted the Player will be moved

// This ones for SaltyChat.dll to apply player
alt.emit("PlayerLoggedIn", player, playerName)

// This ones for the Client to confirm server has Registered the Player
alt.emitClient(player, "SaltyChat_OnConnected")
```
