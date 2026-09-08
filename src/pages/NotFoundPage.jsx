import "./LabPage.css";

export default function NotFoundPage() {
  return (
    <main className="lab-page" data-not-found lang="zh-CN">
      <section className="lab-hero" aria-labelledby="not-found-title">
        <p className="lab-page__kicker">404 · OFF COURSE</p>
        <h1 id="not-found-title">这里还没有可以停靠的页面</h1>
        <div className="lab-hero__intro">
          <p>返回主站，继续浏览 Felix 的现有创作。</p>
          <a className="lab-button lab-button--primary" href="/">返回主站</a>
        </div>
      </section>
    </main>
  );
}
