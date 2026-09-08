import ScrollExpand from "./ScrollExpand/ScrollExpand.jsx";

export default function ScrollExpandSection() {
  return (
    <ScrollExpand
      className="creation-bridge"
      alt=""
      scrollHint=""
      useWindowScroll
      enabled={false}
      endRadius={0}
      mediaZoom={1}
      aria-labelledby="creation-title"
      lang="zh-CN"
    >
      <h2 id="creation-title">在这里，做自己的创世主</h2>
      <p>
        <span className="scroll-expand__copy-line">思路打开，</span>
        <span className="scroll-expand__copy-line">把重复交给 AI，把想法留给自己。</span>
      </p>
    </ScrollExpand>
  );
}
