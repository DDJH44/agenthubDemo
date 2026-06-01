"use client";

import { useState, useMemo } from "react";
import type { Artifact } from "@agenthub/shared";

interface Slide {
  title: string;
  content: string;
  notes?: string;
}

function parseSlidesFromMarkdown(md: string): Slide[] {
  const slides: Slide[] = [];
  const content = md.trim();
  const parts = content.split(/(?=^## )/m);

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const lines = trimmed.split("\n");
    let title = "";
    let body = "";
    let notes: string | undefined;
    let inNotes = false;

    for (const line of lines) {
      if (line.startsWith("## ")) {
        title = line.replace("## ", "").trim();
      } else if (line.startsWith("> ")) {
        inNotes = true;
        notes = (notes ?? "") + line.replace("> ", "").trim() + "\n";
      } else if (inNotes) {
        notes = (notes ?? "") + line.trim() + "\n";
      } else {
        body += line + "\n";
      }
    }

    slides.push({ title, content: body.trim(), notes: notes?.trim() });
  }

  if (slides.length === 0 && content.length > 0) {
    slides.push({ title: "幻灯片 1", content });
  }

  return slides;
}

function parseSlidesFromJson(json: string): Slide[] {
  try {
    const data = JSON.parse(json);
    if (Array.isArray(data)) return data;
    if (data.slides && Array.isArray(data.slides)) return data.slides;
    return [];
  } catch {
    return [];
  }
}

function renderSlideContentToHtml(content: string): string {
  let html = content
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

  html = html.replace(/^- (.+)$/gm, "<li>$1</li>");
  html = html.replace(/(<li>.*<\/li>\n?)+/g, "<ul>$&</ul>");
  html = html.replace(/<\/ul>\n<ul>/g, "");

  html = html.replace(/\n\n/g, "</p><p>");
  html = html.replace(/\n/g, "<br>");

  return `<p>${html}</p>`;
}

export function SlidesRenderer({ artifact }: { artifact: Artifact }) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [showNotes, setShowNotes] = useState(false);

  const slides: Slide[] = useMemo(() => {
    if (!artifact.content) return [];
    if (artifact.type === "slides" || artifact.filename?.endsWith(".json")) {
      const jsonSlides = parseSlidesFromJson(artifact.content);
      if (jsonSlides.length > 0) return jsonSlides;
    }
    return parseSlidesFromMarkdown(artifact.content);
  }, [artifact.content, artifact.type, artifact.filename]);

  if (slides.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--fg-disabled)" strokeWidth="1.5" strokeLinecap="round">
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <path d="M6 8h.01M6 12h.01M6 16h.01M10 8h8M10 12h8M10 16h8" />
        </svg>
        <p style={{ fontSize: "var(--text-xs)", color: "var(--fg-disabled)", marginTop: 12 }}>无法解析幻灯片内容</p>
      </div>
    );
  }

  const slide = slides[currentSlide];
  const totalSlides = slides.length;

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--surface-white)" }}>
      {/* 幻灯片区域 */}
      <div className="flex-1 flex flex-col overflow-hidden" style={{ background: "#fff" }}>
        {/* 幻灯片卡片 */}
        <div className="flex-1 flex items-center justify-center p-6 overflow-auto">
          <div
            className="w-full max-w-3xl rounded-xl overflow-hidden"
            style={{
              boxShadow: "0 4px 24px rgba(0,0,0,0.10), 0 1px 4px rgba(0,0,0,0.06)",
              border: "1px solid var(--border)",
              aspectRatio: "16 / 9",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* 幻灯片头部 */}
            <div
              className="shrink-0 px-8 py-5"
              style={{ borderBottom: "1px solid var(--border)", background: "linear-gradient(135deg, var(--accent), #6366f1)" }}
            >
              <h2 style={{ fontSize: 22, fontWeight: 700, color: "#fff", margin: 0, letterSpacing: "-0.02em" }}>
                {slide.title || `幻灯片 ${currentSlide + 1}`}
              </h2>
              {slide.notes && (
                <p style={{ fontSize: "var(--text-xs)", color: "rgba(255,255,255,0.7)", margin: "4px 0 0" }}>含演讲者备注</p>
              )}
            </div>

            {/* 幻灯片内容 */}
            <div
              className="flex-1 overflow-auto px-8 py-6"
              style={{ background: "#fafbfc" }}
            >
              <div
                className="slide-content"
                style={{
                  fontSize: "var(--text-sm)",
                  color: "var(--fg-primary)",
                  lineHeight: 1.8,
                }}
                dangerouslySetInnerHTML={{
                  __html: renderSlideContentToHtml(slide.content),
                }}
              />
            </div>

            {/* 幻灯片页脚 */}
            <div
              className="shrink-0 flex items-center justify-between px-8 py-2.5"
              style={{ borderTop: "1px solid var(--border)", background: "var(--surface-low)" }}
            >
              <span style={{ fontSize: 10, color: "var(--fg-disabled)" }}>
                {currentSlide + 1} / {totalSlides}
              </span>
              <span style={{ fontSize: 10, color: "var(--fg-disabled)" }}>{artifact.filename || "slides.md"}</span>
            </div>
          </div>
        </div>

        {/* 导航和备注 */}
        <div className="shrink-0 px-4 py-3 border-t" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={() => setCurrentSlide(Math.max(0, currentSlide - 1))}
              disabled={currentSlide === 0}
              className="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
              style={{
                background: currentSlide === 0 ? "var(--surface-low)" : "var(--accent-subtle)",
                color: currentSlide === 0 ? "var(--fg-disabled)" : "var(--accent)",
                opacity: currentSlide === 0 ? 0.4 : 1,
                cursor: currentSlide === 0 ? "default" : "pointer",
                border: `1px solid ${currentSlide === 0 ? "var(--border)" : "var(--accent-border)"}`,
              }}
              title="上一页"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>

            <button
              onClick={() => setShowNotes(!showNotes)}
              className="px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5"
              style={{
                fontSize: "var(--text-2xs)",
                fontWeight: 500,
                background: showNotes ? "var(--accent-subtle)" : "var(--surface-low)",
                color: showNotes ? "var(--accent)" : "var(--fg-tertiary)",
                border: `1px solid ${showNotes ? "var(--accent-border)" : "var(--border)"}`,
              }}
              title="演讲者备注"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
              备注
            </button>

            <button
              onClick={() => setCurrentSlide(Math.min(totalSlides - 1, currentSlide + 1))}
              disabled={currentSlide >= totalSlides - 1}
              className="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
              style={{
                background: currentSlide >= totalSlides - 1 ? "var(--surface-low)" : "var(--accent-subtle)",
                color: currentSlide >= totalSlides - 1 ? "var(--fg-disabled)" : "var(--accent)",
                opacity: currentSlide >= totalSlides - 1 ? 0.4 : 1,
                cursor: currentSlide >= totalSlides - 1 ? "default" : "pointer",
                border: `1px solid ${currentSlide >= totalSlides - 1 ? "var(--border)" : "var(--accent-border)"}`,
              }}
              title="下一页"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          </div>

          {/* 页面缩略图 */}
          <div className="flex items-center justify-center gap-1 mt-3 overflow-x-auto pb-1">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentSlide(i)}
                className="shrink-0 rounded transition-all"
                style={{
                  width: i === currentSlide ? 10 : 7,
                  height: i === currentSlide ? 10 : 7,
                  background: i === currentSlide ? "var(--accent)" : "var(--border)",
                  borderRadius: "50%",
                  border: "none",
                  cursor: "pointer",
                }}
                title={`幻灯片 ${i + 1}`}
              />
            ))}
          </div>

          {/* 演讲者备注 */}
          {showNotes && slide.notes && (
            <div className="mt-3 px-4 py-3 rounded-lg" style={{ background: "#fffbeb", border: "1px solid #fde68a" }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: "#92400e", marginBottom: 4 }}>演讲者备注</div>
              <pre style={{ fontSize: "var(--text-2xs)", color: "#78350f", lineHeight: 1.6, whiteSpace: "pre-wrap", margin: 0, fontFamily: "var(--font-sans)" }}>
                {slide.notes}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function SlidesTab({ artifacts }: { artifacts: Artifact[] }) {
  const slidesArtifacts = artifacts.filter(
    (a) => a.type === "slides" || a.filename?.endsWith(".md") || a.type === "document"
  );

  if (slidesArtifacts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p style={{ fontSize: "var(--text-xs)", color: "var(--fg-disabled)" }}>暂无幻灯片产物</p>
      </div>
    );
  }

  return <SlidesRenderer artifact={slidesArtifacts[0]} />;
}
