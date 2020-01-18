using System;
using AltV.Net;

namespace SaltyChatServer
{
    internal class SaltyChatServer : Resource
    {
        public override void OnStart()
        {
            Alt.Emit("StartServer");
            Console.WriteLine("=====> Salty Chat Server Started =)");
        }

        public override void OnStop()
        {
            Console.WriteLine("=====> Salty Chat Server Stopped!!!");
        }
    }
}
