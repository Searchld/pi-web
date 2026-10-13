"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/hooks/useI18n";

type DemoStep = {
  tone: "input" | "output";
  messageKey: string;
};

const DEMO_STEPS: DemoStep[] = [
  { tone: "input", messageKey: "chat.businessDemoInput" },
  { tone: "output", messageKey: "chat.businessDemoIntent" },
  { tone: "output", messageKey: "chat.businessDemoScope" },
  { tone: "output", messageKey: "chat.businessDemoOutput" },
  { tone: "output", messageKey: "chat.businessDemoReady" },
];

/** 空会话的纯前端演示，不读取、请求或展示任何真实业务数据。 */
export function BusinessIdleDemo() {
  const { t } = useI18n();
  const [stepIndex, setStepIndex] = useState(0);
  const [visibleLength, setVisibleLength] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<DemoStep[]>([]);
  const step = DEMO_STEPS[stepIndex];
  const message = t(step.messageKey);
  const complete = visibleLength >= message.length;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!complete) {
        setVisibleLength((length) => Math.min(length + 1, message.length));
        return;
      }
      setCompletedSteps((steps) => [...steps, step].slice(-3));
      setStepIndex((index) => (index + 1) % DEMO_STEPS.length);
      setVisibleLength(0);
    }, complete ? 1400 : 52);
    return () => window.clearTimeout(timer);
  }, [complete, message.length, step, stepIndex, visibleLength]);

  return (
    <section className="qm-business-idle-demo" aria-label={t("chat.businessDemoTitle")}>
      <div className="qm-business-idle-demo-header">
        <span className="qm-business-idle-demo-dot" />
        <span>WebAgent</span>
        <span>{t("chat.businessDemoTitle")}</span>
        <span>{t("chat.businessDemoLabel")}</span>
      </div>
      <div className="qm-business-idle-demo-stage">
        <div className="qm-business-idle-demo-rail" aria-hidden="true" />
        {completedSteps.map((completedStep, index) => (
          <div
            key={`${completedStep.messageKey}-${index}`}
            className={`qm-business-idle-demo-line is-${completedStep.tone} is-complete`}
          >
            <span className="qm-business-idle-demo-line-symbol" aria-hidden="true">
              {completedStep.tone === "input" ? ">" : "✓"}
            </span>
            <span>{t(completedStep.messageKey)}</span>
          </div>
        ))}
        <div className={`qm-business-idle-demo-line is-active is-${step.tone}`}>
          <span className="qm-business-idle-demo-line-symbol" aria-hidden="true">
            {step.tone === "input" ? ">" : "✓"}
          </span>
          <div>
            <div className="qm-business-idle-demo-line-label">
              {step.tone === "input" ? t("chat.businessDemoUser") : "WebAgent"}
            </div>
            <div className="qm-business-idle-demo-line-message">
              {message.slice(0, visibleLength)}
              <span className="qm-business-idle-demo-cursor" aria-hidden="true" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
