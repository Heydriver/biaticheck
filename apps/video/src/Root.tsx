import { Composition } from "remotion";
import { DAUER, Erklaervideo } from "./Erklaervideo";

export function Root() {
  return (
    <>
      <Composition id="Erklaervideo" component={Erklaervideo} durationInFrames={DAUER} fps={30} width={1920} height={1080} defaultProps={{ hochkant: false }} />
      <Composition id="ErklaervideoHochkant" component={Erklaervideo} durationInFrames={DAUER} fps={30} width={1080} height={1920} defaultProps={{ hochkant: true }} />
    </>
  );
}
