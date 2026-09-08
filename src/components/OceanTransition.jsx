import wormholeEndFrame from "../../assets/wormhole-home-end.png";

export default function OceanTransition() {
  return (
    <div className="ocean-transition" data-wormhole-handoff aria-hidden="true">
      <img
        className="ocean-transition__frame"
        src={wormholeEndFrame}
        alt=""
        draggable="false"
      />
      <span className="ocean-transition__horizon" />
    </div>
  );
}
