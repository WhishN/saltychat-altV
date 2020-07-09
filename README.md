# saltychat-altV
alt:V Version of Saltychat Plugin using C# Serverside

Fill in Serverside required Settings, compile the Serverside and add it to your server

For alt:V Specific Questions consider asking in [alt:V Discord](https://dscrd.in/altVMP)

How to enable the plugin on connect:

Only after this function will be emitted the player will be moved into the channel.

```csharp
Alt.Emit("PlayerLoggedIn", player, playerName);
```
