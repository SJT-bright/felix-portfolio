import { useEffect, useRef, useState } from "react";

import { copyContact } from "../lib/copy-contact.js";
import "./LabPage.css";

const CONTACT = "SJTbright-future";

const resultLinks = [
    {
    number: "01",
    title: "站点与交互",
    description: "已上线的页面：看结构、组件与动效如何协同落地。",
    href: "/#project-showcase",
    badge: "页面结构",
  },
  {
    number: "02",
    title: "视觉实验",
    description: "排版的节奏、画面的关系，还有细节的质感。",
    href: "/#image-archive",
    badge: "视觉表达",
  },
  {
    number: "03",
    title: "影像空间",
    description: "点开沉浸页，体验一体化的作品展示空间。",
    href: "/portfolio/index.html",
    badge: "沉浸体验",
  },
];

export default function LabPage() {
  const [copyState, setCopyState] = useState("idle");
  const operationRef = useRef(0);
  const timerRef = useRef(null);

  useEffect(() => () => {
    operationRef.current += 1;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
  }, []);

  const handleCopy = async () => {
    if (copyState === "copying") return;
    const operation = operationRef.current + 1;
    operationRef.current = operation;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    setCopyState("copying");

    const copied = await copyContact(CONTACT);
    if (operationRef.current !== operation) return;

    setCopyState(copied ? "success" : "error");
    if (copied) {
      timerRef.current = window.setTimeout(() => {
        if (operationRef.current === operation) setCopyState("idle");
      }, 2200);
    }
  };

  const copyStatus = copyState === "success"
    ? "已复制"
    : copyState === "error"
      ? "无法自动复制，请手动复制上方账号。"
      : "";

  return (
    <main className="lab-page" data-lab-page lang="zh-CN">
      <a className="lab-page__home" href="/">← 返回 Felix 首页</a>

      <section className="lab-hero" aria-labelledby="lab-title">
        <div className="lab-hero__content">
        <div className="lab-hero__heading">
              <p className="lab-page__kicker">FELIX CREATIVE LAB</p>
            <h1
              id="lab-title"
              aria-label="先看作品，再决定是否继续交流。"
            >
              <span className="lab-title__visual" aria-hidden="true">
                <span data-lab-title-line>先看作品，</span>
                <span data-lab-title-line>再决定是否</span>
                <span data-lab-title-line>继续交流。</span>
              </span>
            </h1>
          </div>
        <div className="lab-hero__intro">
            <p>
              我是 Felix。这里展示的都是真实作品——结构、画面、节奏，欢迎细看。
            </p>
            <nav className="lab-hero__actions" aria-label="实验室页面入口">
              <a className="lab-button lab-button--primary" href="#lab-results">直接看作品</a>
              <a className="lab-button" href="#lab-contact">看完再聊</a>
            </nav>
          </div>
        </div>
          <div className="lab-hero__aside" aria-label="互动说明区">
            <article className="lab-hero__bubble">
            <p className="lab-hero__bubble-label">作品优先</p>
              <p>每个入口都是能直接打开的真实页面，点开即看。</p>
            </article>
            <article className="lab-hero__bubble lab-hero__bubble--alt">
              <p className="lab-hero__bubble-label">轻量社群</p>
              <p>看完说下感受，带上作品编号更好；也可以转给朋友一起看。</p>
            </article>
            <ul className="lab-hero__chips" aria-label="快捷入口">
              <li><a href="#lab-results" className="lab-button lab-button--chip lab-button--spark">作品总览</a></li>
              <li><a href="#lab-contact" className="lab-button lab-button--chip lab-button--spark">发作品反馈</a></li>
              <li><a href="/#project-showcase" className="lab-button lab-button--chip lab-button--spark">查看首页作品</a></li>
            </ul>
            <div className="lab-hero__quick-links">
              <a className="lab-button lab-button--chip" href="#lab-results">去作品入口</a>
            </div>
          </div>
      </section>

      <section
        className="lab-results"
        id="lab-results"
        tabIndex={-1}
        aria-labelledby="lab-results-title"
      >
        <header className="lab-section-heading">
          <p className="lab-page__kicker">CURRENT INDEX</p>
            <h2 id="lab-results-title">从这三个入口开始看。</h2>
            <p>
            三个入口都能直接打开；看完想聊，随时回到页面底部找我。
          </p>
        </header>
        <div className="lab-results__list">
          {resultLinks.map((result) => (
            <a key={result.number} className="lab-result" href={result.href} data-lab-result>
              <span className="lab-result__number">{result.number}</span>
              <span className="lab-result__copy">
                <strong>{result.title}</strong>
                <span>{result.description}</span>
                <span className="lab-result__badge">{result.badge}</span>
              </span>
              <span className="lab-result__arrow" aria-hidden="true">↗</span>
            </a>
          ))}
        </div>
      </section>

      <section className="lab-exchange" aria-labelledby="lab-exchange-title">
        <div className="lab-section-heading">
          <p className="lab-page__kicker">交流方式</p>
          <h2 id="lab-exchange-title">觉得对味，我们可以这样聊。</h2>
        </div>
        <div className="lab-exchange__columns">
          <div className="lab-exchange__bubble">
            <p className="lab-exchange__meta">我会分享</p>
            <h3>围绕你看中的作品聊。</h3>
            <p>你点出在意的作品，我基于自己的制作过程给出建议。</p>
            <div className="lab-exchange__actions" aria-label="作品入口">
              <button type="button" className="lab-button lab-button--chip" onClick={() => window?.location?.assign("/#project-showcase")}>
                直接看页面结构
              </button>
              <button type="button" className="lab-button lab-button--chip lab-button--ghost" onClick={() => window?.location?.assign("/#image-archive")}>
                直接看视觉样本
              </button>
            </div>
          </div>
          <div className="lab-exchange__bubble">
            <p className="lab-exchange__meta">你可以带来</p>
            <h3>一个问题就够了。</h3>
            <p>一张截图、一个链接，或一个问题，任选其一；其余看完再补。</p>
            <div className="lab-exchange__actions" aria-label="交流入口">
              <a className="lab-button lab-button--chip" href="#lab-contact">
                发来你的问题或作品
              </a>
            </div>
          </div>
        </div>
      </section>

      <section
        className="lab-contact"
        id="lab-contact"
        tabIndex={-1}
        aria-labelledby="lab-contact-title"
      >
        <p className="lab-page__kicker">CONTACT</p>
        <h2 id="lab-contact-title">看完作品，随时来聊。</h2>
        <div className="lab-contact__row">
          <p className="lab-contact__account" aria-label={`联系方式 ${CONTACT}`}>{CONTACT}</p>
          <button
            className="lab-contact__copy"
            type="button"
            data-copy-contact
            onClick={handleCopy}
            aria-disabled={copyState === "copying"}
          >
            {copyState === "success" ? "已复制" : copyState === "copying" ? "复制中…" : "复制联系方式"}
          </button>
        </div>
        <p className="lab-contact__status" data-copy-status role="status" aria-live="polite">
          {copyStatus}
        </p>
        <p className="lab-contact__hint">附上作品编号和你的想法，我能更快对上话。</p>
        <p className="lab-contact__disclaimer">由 Felix 自主发起，与学校官方机构无隶属关系。</p>
        <div className="lab-contact__buttons">
          <a className="lab-button lab-button--chip" href="#lab-results">回到作品入口</a>
        </div>
      </section>
    </main>
  );
}
