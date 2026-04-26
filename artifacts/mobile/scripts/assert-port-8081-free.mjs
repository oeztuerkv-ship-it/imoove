/**
 * Verhindert, dass Metro still auf einem anderen Port startet oder Expo nach 8082 fragt:
 * Wenn 127.0.0.1:8081 schon lauscht, sofort mit klarer Meldung abbrechen.
 */
import * as net from "node:net";

await new Promise((resolve, reject) => {
  const socket = net.createConnection({ port: 8081, host: "127.0.0.1" });
  socket.setTimeout(2000);

  socket.on("connect", () => {
    socket.destroy();
    console.error(
      [
        "",
        "[Mobile] Port 8081 ist bereits belegt (vermutlich alter Metro/Expo).",
        "        Expo soll nicht auf 8082 wechseln — bitte Prozess beenden und erneut starten.",
        "",
        "        Prüfen:  lsof -i :8081",
        "        Details:  ps -p <PID> -o args=",
        "        Beenden: kill <PID>   (nur wenn klar Expo/Metro aus diesem Projekt)",
        "",
      ].join("\n"),
    );
    process.exit(1);
  });

  socket.on("error", (err) => {
    socket.destroy();
    if (err.code === "ECONNREFUSED" || err.code === "EHOSTUNREACH") {
      resolve();
      return;
    }
    reject(err);
  });

  socket.on("timeout", () => {
    try {
      socket.destroy();
    } catch {
      /* ignore */
    }
    resolve();
  });
});
