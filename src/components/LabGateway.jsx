import { useEffect, useRef, useState } from "react";

import { copyContact } from "../lib/copy-contact.js";
import "./LabGateway.css";

const CONTACT = "SJTbright-future";

export default function LabGateway() {
  const [copyState, setCopyState] = useState("idle");
  const operationRef = useRef(0);
  const timerRef = useRef(null);
  const navigateTimerRef = useRef(null);

  useEffect(() => () => {
    operationRef.current += 1;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    if (navigateTimerRef.current !== null) window.clearTimeout(navigateTimerRef.current);
  }, []);

  const runCopy = async () => {
    if (copyState === "copying") return null;
    const operation = operationRef.current + 1;
    operationRef.current = operation;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    setCopyState("copying");

    const copied = await copyContact(CONTACT);
    if (operationRef.current !== operation) return null;

    setCopyState(copied ? "success" : "error");
    if (copied) {
      timerRef.current = window.setTimeout(() => {
        if (operationRef.current === operation) setCopyState("idle");
      }, 2400);
    }
    return copied;
  };

  const handleBenefitClick = async (event) => {
    event.preventDefault();
    const copied = await runCopy();
    if (!copied) return;
    navigateTimerRef.current = window.setTimeout(() => {
      window.location.assign("/lab");
    }, 1000);
  };

  const handleManualCopy = () => {
    void runCopy();
  };

  const statusText = copyState === "success"
    ? `已复制微信号 ${CONTACT}`
    : copyState === "error"
      ? "无法自动复制，请手动复制上方微信号。"
      : copyState === "copying"
        ? "正在复制微信号…"
        : "";

  return (
    <section
      className="lab-gateway"
      data-lab-gateway
      lang="zh-CN"
      aria-labelledby="lab-gateway-title"
    >
      <div className="lab-gateway__inner">
        <div className="lab-gateway__heading">
          <p className="lab-gateway__kicker">AI COMMUNITY</p>
          <h2 id="lab-gateway-title">欢迎加入 AI 社群</h2>
        </div>
        <div className="lab-gateway__invitation">
          <a className="lab-gateway__link" href="/lab" onClick={handleBenefitClick}>
            <span>进群福利</span>
            <span aria-hidden="true">↗</span>
          </a>
          <div className="lab-gateway__contact">
            <p className="lab-gateway__account" aria-label={`微信号 ${CONTACT}`}>{CONTACT}</p>
            <button
              className="lab-gateway__copy"
              type="button"
              data-gateway-copy
              onClick={handleManualCopy}
              aria-disabled={copyState === "copying"}
            >
              {copyState === "success" ? "已复制" : copyState === "copying" ? "复制中…" : "复制微信号"}
            </button>
          </div>
          <p className="lab-gateway__status" data-gateway-status role="status" aria-live="polite">
            {statusText}
          </p>
        </div>
      </div>
    </section>
  );
}
