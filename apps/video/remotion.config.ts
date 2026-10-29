import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setCodec("h264");
Config.setCrf(20);
// Für Web-Wiedergabe: Metadaten an den Anfang, damit das Video sofort startet
Config.setPixelFormat("yuv420p");
