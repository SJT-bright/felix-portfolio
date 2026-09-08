import profilePortrait from "../assets/profile-felix-cat-background.jpg";
import ProfileStarTrail from "./ProfileStarTrail.jsx";

const profileProofs = [
  ["短剧", "已签约短剧公司 · 参与城市短剧项目制作"],
  ["社区", "美团 AI 原生社区「觅游」校园大使"],
  ["网站", "累计接单收入超过 7000 元"],
  ["实践", "5 个竞赛项目 PPT · 校园评分与课表小程序推进中"],
];

export default function ProfileLanding({ onReplay }) {
  return (
    <div className="profile-landing" data-profile-landing lang="zh-CN">
      <figure className="profile-landing__portrait" data-profile-portrait>
        <img
          src={profilePortrait}
          alt="Felix 与猫对望的黑白肖像，作为个人介绍背景"
          width="940"
          height="940"
          loading="eager"
          decoding="async"
        />
        <figcaption>司钧霆 · FELIX</figcaption>
      </figure>

      <div className="profile-landing__masthead">
        <p>司钧霆 · FELIX</p>
        <p>SJTbright-future</p>
      </div>

      <div className="profile-landing__layout">
        <div className="profile-landing__copy">
          <p className="profile-landing__eyebrow" data-profile-reveal style={{ "--profile-delay": "80ms" }}>AI LEARNING &amp; CO-CREATION</p>
          <h1 id="profile-title" data-profile-reveal style={{ "--profile-delay": "160ms" }}>我是 Felix。</h1>
          <p className="profile-landing__role" data-profile-reveal style={{ "--profile-delay": "240ms" }}>社群群主 · AI 创作者</p>
          <p className="profile-landing__intro" data-profile-reveal style={{ "--profile-delay": "320ms" }}>
            面向 AI 新手与进阶创作者，一起学习、拆解项目，也一起把视频、网站和视觉想法做出来。
          </p>
          <p className="profile-landing__disciplines" data-profile-reveal style={{ "--profile-delay": "380ms" }}>
            AI 入门 / 项目进阶 / 视频 / 网站 / 视觉共创
          </p>

          <dl className="profile-landing__proofs" aria-label="Felix 个人经历" data-profile-reveal style={{ "--profile-delay": "440ms" }}>
            {profileProofs.map(([label, detail]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{detail}</dd>
              </div>
            ))}
          </dl>

          <p className="profile-landing__disclaimer" data-profile-reveal style={{ "--profile-delay": "520ms" }}>
            以上均为 Felix 个人经历；社群由个人发起，非学校、美团或短剧公司官方项目，个人履历不构成机构背书。
          </p>
        </div>

      </div>

      <div className="profile-landing__footer">
        <p className="profile-landing__cue" lang="en">SCROLL TO EXPLORE</p>
        <button className="profile-landing__replay" type="button" onClick={onReplay} aria-label="重新播放带音乐的首页序章">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <path d="M4 10a8 8 0 1 1 .5 6M4 4v6h6" />
          </svg>
          重播序章
        </button>
      </div>
      <ProfileStarTrail />
    </div>
  );
}
