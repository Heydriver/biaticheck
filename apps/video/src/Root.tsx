import { Composition } from "remotion";
import { DAUER, Erklaervideo } from "./Erklaervideo";
import { Pitchvideo, PITCH_DAUER } from "./Pitchvideo";

export function Root() {
  return (
    <>
      <Composition id="Erklaervideo" component={Erklaervideo} durationInFrames={DAUER} fps={30} width={1920} height={1080} defaultProps={{ hochkant: false }} />
      <Composition id="ErklaervideoHochkant" component={Erklaervideo} durationInFrames={DAUER} fps={30} width={1080} height={1920} defaultProps={{ hochkant: true }} />
      <Composition id="Pitchvideo" component={Pitchvideo} durationInFrames={PITCH_DAUER} fps={30} width={1920} height={1080} />
    </>
  );
}
