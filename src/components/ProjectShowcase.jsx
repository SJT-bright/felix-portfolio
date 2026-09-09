import { useEffect, useRef, useState } from "react";
import "./ProjectShowcase/ProjectShowcase.css";

import { BentoGrid, BentoGridItem } from "./ProjectShowcase/BentoGrid.jsx";
import PortfolioEntryTransition from "./PortfolioEntryTransition.jsx";
import GitHubProjectList from "./ProjectShowcase/GitHubProjectList.jsx";
import ProjectCard from "./ProjectShowcase/ProjectCard.jsx";
import { projectItems } from "../data/projectItems.js";
import portfolioGatewayImage from "../assets/portfolio-gallery-backdrop.jpg";

const portfolioGatewayMedia = {
  src: portfolioGatewayImage,
  width: 1672,
  height: 941,
};

const SHOWCASE_TRAILS = [
  { top: "8%", left: "8%", delay: 0.2, duration: 2.8, length: 180, size: 0.85, deltaX: "110vw", deltaY: "18vh", angle: -30, opacity: 0.42 },
  { top: "16%", left: "62%", delay: 1.4, duration: 3.4, length: 220, size: 1.05, deltaX: "122vw", deltaY: "10vh", angle: -24, opacity: 0.48 },
  { top: "28%", left: "84%", delay: 0.9, duration: 2.6, length: 160, size: 0.8, deltaX: "96vw", deltaY: "28vh", angle: -48, opacity: 0.38 },
  { top: "54%", left: "22%", delay: 2.2, duration: 3.1, length: 210, size: 1.0, deltaX: "112vw", deltaY: "34vh", angle: -38, opacity: 0.45 },
  { top: "64%", left: "74%", delay: 1.8, duration: 2.9, length: 180, size: 0.8, deltaX: "95vw", deltaY: "16vh", angle: -55, opacity: 0.4 },
  { top: "34%", left: "42%", delay: 0.5, duration: 4.0, length: 240, size: 1.15, deltaX: "120vw", deltaY: "22vh", angle: -44, opacity: 0.5 },
  { top: "75%", left: "38%", delay: 2.6, duration: 3.6, length: 150, size: 0.9, deltaX: "100vw", deltaY: "-8vh", angle: -10, opacity: 0.38 },
  { top: "86%", left: "68%", delay: 3.0, duration: 3.2, length: 190, size: 0.95, deltaX: "104vw", deltaY: "4vh", angle: -36, opacity: 0.44 },
];

const PRACTICAL_WORKS = [
  {
    number: "A",
    title: "生活作战台",
    kicker: "实用 · 时间与节奏",
    summary: "把创作、工作、休息放进同一套执行系统，支持今日清单与节拍回顾。",
    details: [
      "自动聚合灵感、待办和交付节点。",
      "支持工作日/周末不同节奏的任务模版。",
      "关键任务可一键置顶，减少跳转成本。",
    ],
  },
  {
    number: "B",
    title: "内容发布管家",
    kicker: "实用 · 社群与传播",
    summary: "围绕作品更新，自动给出发布时间与素材结构提示，降低信息噪音。",
    details: [
      "记录每次发布前的核心信息与受众画像。",
      "提供标题、摘要、标签三层建议框架。",
      "在社区反馈与二次创作之间形成闭环。",
    ],
  },
  {
    number: "C",
    title: "情绪与节律面板",
    kicker: "实用 · 生活状态",
    summary: "从创作强度到休息质量，做一套更容易坚持的身心节律。",
    details: [
      "按时间段记录情绪曲线，提醒你切换模式。",
      "搭配专注/放松/复盘三种状态切换。",
      "用“是否该暂停”作为关键决策锚点。",
    ],
  },
  {
    number: "D",
    title: "知识整合工作台",
    kicker: "实用 · 学习与沉淀",
    summary: "把作品灵感、案例、反馈归类到可复用的行动清单。",
    details: [
      "关键词聚类，快速定位同类问题。",
      "支持把反馈自动转成可执行清单。",
      "每周导出“下一步试验清单”。",
    ],
  },
];

export default function ProjectShowcase() {
  const sectionRef = useRef(null);
  const [activePracticalIndex, setActivePracticalIndex] = useState(0);

  useEffect(() => {
    const sectionElement = sectionRef.current;
    if (!sectionElement) return undefined;

    if (!("IntersectionObserver" in window)) {
      sectionElement
        .querySelectorAll(
          ".project-showcase__header, .project-bento-grid__item--entry, .github-projects, .github-projects__card, .portfolio-gateway, .project-showcase__utility-section, .project-showcase__utility-card"
        )
        .forEach((node) => {
          node.classList.add("is-visible");
        });
      return undefined;
    }

    const revealTargets = [
      sectionElement.querySelector(".project-showcase__header"),
      ...sectionElement.querySelectorAll(".project-bento-grid__item--entry"),
      sectionElement.querySelector(".github-projects"),
      ...sectionElement.querySelectorAll(".github-projects__card"),
      sectionElement.querySelector(".portfolio-gateway"),
      sectionElement.querySelector(".project-showcase__utility-section"),
      ...sectionElement.querySelectorAll(".project-showcase__utility-card"),
    ].filter(Boolean);

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    }, { threshold: 0.16 });

    for (const target of revealTargets) {
      if (target) observer.observe(target);
    }

    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <section
      ref={sectionRef}
      id="project-showcase"
      tabIndex={-1}
      data-project-showcase
      lang="zh-CN"
      aria-labelledby="project-showcase-title"
      className="project-showcase"
    >
      <div className="project-showcase__starfield" aria-hidden="true">
        {SHOWCASE_TRAILS.map((star, index) => (
          <span
            key={`showcase-star-${index}`}
            className="project-showcase__shooting-star"
            style={{
              "--shooting-star-top": star.top,
              "--shooting-star-left": star.left,
              "--shooting-star-delay": `${star.delay}s`,
              "--shooting-star-duration": `${star.duration}s`,
              "--shooting-star-length": `${star.length}px`,
              "--shooting-star-size": star.size,
              "--shooting-star-delta-x": star.deltaX,
              "--shooting-star-delta-y": star.deltaY,
              "--shooting-star-angle": `${star.angle}deg`,
              "--shooting-star-opacity": star.opacity,
            }}
          />
        ))}
      </div>
      <div className="project-showcase__content">
        <header className="project-showcase__header">
          <p className="project-showcase__eyebrow">Selected Works</p>
          <h2 id="project-showcase-title">我的数字作品</h2>
          <p className="project-showcase__intro">八个网站与交互方向：前六项已上线，可直接访问；第七、八项将随素材补充。</p>
        </header>
        <BentoGrid>
          {projectItems.map((project, index) => (
            <BentoGridItem
              key={project.id}
              className="project-showcase__item project-bento-grid__item--entry"
              style={{ "--project-item-delay": `${(index % 2) * 90}ms` }}
            >
              <ProjectCard {...project} />
            </BentoGridItem>
          ))}
        </BentoGrid>
        <GitHubProjectList />
        <aside id="portfolio-gallery" tabIndex={-1} className="portfolio-gateway" aria-label="Felix 影像馆入口">
          <figure className="portfolio-gateway__photo" aria-hidden="true">
            <span className="portfolio-gateway__photo-fallback">影像馆人物写真背景</span>
            <img
              className="portfolio-gateway__image"
              src={portfolioGatewayMedia.src}
              alt=""
              width={portfolioGatewayMedia.width}
              height={portfolioGatewayMedia.height}
              loading="eager"
              decoding="async"
            />
          </figure>
          <div className="portfolio-gateway__copy">
            <p className="portfolio-gateway__kicker">Felix · Visual Archive</p>
            <h3 className="portfolio-gateway__title">影像馆</h3>
            <p className="portfolio-gateway__supporting">把网站之外的图像、片段与灵感，收进另一片海域。</p>
          </div>
          <div className="portfolio-gateway__action">
            <p className="portfolio-gateway__marker"><span>A PRIVATE</span><span>VISUAL SPACE</span></p>
            <PortfolioEntryTransition />
          </div>
        </aside>
        <section className="project-showcase__utility-section" aria-label="实用赋能展示">
          <div className="project-showcase__divider" />
          <header className="project-showcase__utility-header">
            <p className="project-showcase__utility-eyebrow">Practical Toolkit</p>
            <h3 className="project-showcase__utility-title">真实赋能生活的创作者工具场</h3>
            <p className="project-showcase__utility-intro">四个交互模块，围绕日常执行、传播和复盘展开，让作品更快落地到生活。点击卡片可展开查看适配策略。</p>
          </header>
          <div className="project-showcase__utility-grid">
            {PRACTICAL_WORKS.map((item, index) => (
              <article
                key={item.number}
                className={`project-showcase__utility-card ${activePracticalIndex === index ? "is-open" : ""}`}
              >
                <button
                  type="button"
                  className="project-showcase__utility-toggle"
                  onClick={() => setActivePracticalIndex((prev) => (prev === index ? -1 : index))}
                  aria-expanded={activePracticalIndex === index}
                  aria-controls={`practical-detail-${item.number}`}
                  onMouseEnter={() => setActivePracticalIndex(index)}
                >
                  <span className="project-showcase__utility-kicker">{item.kicker}</span>
                  <h4>{item.title}</h4>
                  <p>{item.summary}</p>
                  <span className="project-showcase__utility-state">点击展开策略</span>
                  <span className="project-showcase__utility-indicator" aria-hidden="true">
                    {activePracticalIndex === index ? "−" : "+"}
                  </span>
                </button>
                <div
                  id={`practical-detail-${item.number}`}
                  className={`project-showcase__utility-content ${activePracticalIndex === index ? "is-open" : ""}`}
                >
                  <ul>
                    {item.details.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}
