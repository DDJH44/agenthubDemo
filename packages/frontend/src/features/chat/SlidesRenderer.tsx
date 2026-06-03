"use client";

import { useMemo, useState } from "react";
import type { Artifact } from "@agenthub/shared";
import { parseSlidesArtifact, type ParsedSlide, type SlideBlock } from "./slide-parser";

function isSafeImageSrc(src: string) {
  return /^(https?:\/\/|data:image\/|\/)/i.test(src);
}

function SlideBlockView({ block }: { block: SlideBlock }) {
  switch (block.type) {
    case "heading":
      return <h3 className="m-0 text-lg font-bold leading-tight" style={{ color: "var(--fg-primary)" }}>{block.text}</h3>;
    case "bullet":
      return (
        <ul className="m-0 space-y-2 pl-0">
          {block.items.map((item, index) => (
            <li key={`${index}-${item}`} className="flex gap-2 text-sm leading-relaxed" style={{ color: "var(--fg-secondary)" }}>
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--accent)" }} />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      );
    case "image":
      return isSafeImageSrc(block.src) ? (
        <figure className="m-0 overflow-hidden rounded-lg" style={{ border: "1px solid var(--border)", background: "var(--surface-low)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={block.src} alt={block.alt || ""} className="max-h-[220px] w-full object-contain" />
          {block.alt && <figcaption className="px-3 py-1.5 text-[11px]" style={{ color: "var(--fg-tertiary)" }}>{block.alt}</figcaption>}
        </figure>
      ) : null;
    case "code":
      return (
        <pre className="m-0 max-h-[180px] overflow-auto rounded-lg p-3 text-[11px] leading-relaxed" style={{ color: "#dbe7ff", background: "#10182b" }}>
          <code>{block.code}</code>
        </pre>
      );
    case "quote":
      return (
        <blockquote className="m-0 rounded-lg px-3 py-2 text-sm leading-relaxed" style={{ color: "var(--fg-secondary)", background: "var(--surface-low)", borderLeft: "3px solid var(--accent)" }}>
          {block.text}
        </blockquote>
      );
    case "metric":
      return (
        <div className="rounded-lg px-4 py-3" style={{ background: "var(--accent-subtle)", border: "1px solid var(--accent-border)" }}>
          <div className="text-2xl font-bold" style={{ color: "var(--accent)" }}>{block.value}</div>
          <div className="mt-1 text-xs font-semibold" style={{ color: "var(--fg-primary)" }}>{block.label}</div>
          {block.helper && <div className="mt-1 text-[11px]" style={{ color: "var(--fg-tertiary)" }}>{block.helper}</div>}
        </div>
      );
    case "text":
    default:
      return <p className="m-0 whitespace-pre-wrap text-sm leading-relaxed" style={{ color: "var(--fg-secondary)" }}>{block.text}</p>;
  }
}

function Thumbnail({ slide, index, active, onClick }: { slide: ParsedSlide; index: number; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-start gap-2 rounded-lg p-2 text-left transition-colors"
      style={{
        background: active ? "var(--accent-subtle)" : "transparent",
        border: `1px solid ${active ? "var(--accent-border)" : "transparent"}`,
      }}
    >
      <span
        className="grid h-5 w-5 shrink-0 place-items-center rounded-md text-[10px] font-bold"
        style={{ color: active ? "#fff" : "var(--fg-tertiary)", background: active ? "var(--accent)" : "var(--surface-low)" }}
      >
        {index + 1}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-semibold" style={{ color: "var(--fg-primary)" }}>{slide.title}</span>
        <span className="mt-0.5 block truncate text-[10px]" style={{ color: "var(--fg-tertiary)" }}>
          {slide.subtitle || `${slide.blocks.length} blocks`}
        </span>
      </span>
    </button>
  );
}

function SlideCanvas({ slide, index, total }: { slide: ParsedSlide; index: number; total: number }) {
  const isTitleLayout = slide.layout === "title" || slide.layout === "section";
  const blocks = slide.blocks.length > 0 ? slide.blocks : [{ type: "text" as const, text: "暂无正文内容" }];

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg" style={{ background: "#ffffff", border: "1px solid var(--border)", boxShadow: "0 16px 40px rgba(31, 42, 68, 0.10)" }}>
      <div
        className="shrink-0 px-7 py-5"
        style={{
          background: isTitleLayout ? "linear-gradient(135deg, #f8faff 0%, #eef3ff 100%)" : "#f8faff",
          borderBottom: "1px solid var(--divider)",
        }}
      >
        <div className="mb-2 h-1 w-10 rounded-full" style={{ background: "var(--accent)" }} />
        <h2 className="m-0 text-2xl font-bold leading-tight" style={{ color: "var(--fg-primary)", letterSpacing: 0 }}>{slide.title}</h2>
        {slide.subtitle && <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--fg-tertiary)" }}>{slide.subtitle}</p>}
      </div>

      <div className={`grid flex-1 gap-4 overflow-auto p-7 ${isTitleLayout ? "content-center" : "content-start"}`}>
        {blocks.map((block, blockIndex) => <SlideBlockView key={`${block.type}-${blockIndex}`} block={block} />)}
      </div>

      <div className="flex h-9 shrink-0 items-center justify-between px-7 text-[10px]" style={{ color: "var(--fg-tertiary)", background: "var(--surface-low)", borderTop: "1px solid var(--divider)" }}>
        <span>AgentHub Slides</span>
        <span>{index + 1} / {total}</span>
      </div>
    </div>
  );
}

export function SlidesRenderer({ artifact }: { artifact: Artifact }) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [showNotes, setShowNotes] = useState(false);
  const slides = useMemo(() => parseSlidesArtifact(artifact), [artifact]);
  const totalSlides = slides.length;

  if (totalSlides === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--fg-disabled)" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <path d="M6 8h.01M6 12h.01M6 16h.01M10 8h8M10 12h8M10 16h8" />
        </svg>
        <p className="mt-3 text-xs" style={{ color: "var(--fg-disabled)" }}>无法解析幻灯片内容</p>
      </div>
    );
  }

  const safeCurrentSlide = Math.min(currentSlide, Math.max(0, totalSlides - 1));
  const slide = slides[safeCurrentSlide];

  return (
    <div className="grid h-full min-h-0 grid-cols-[150px_minmax(0,1fr)] overflow-hidden" style={{ background: "var(--surface-white)" }}>
      <aside className="min-h-0 overflow-y-auto p-2" style={{ background: "var(--surface-low)", borderRight: "1px solid var(--divider)" }}>
        <div className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--fg-tertiary)" }}>
          {totalSlides} slides
        </div>
        <div className="space-y-1">
          {slides.map((item, index) => (
            <Thumbnail
              key={item.id}
              slide={item}
              index={index}
              active={index === safeCurrentSlide}
              onClick={() => setCurrentSlide(index)}
            />
          ))}
        </div>
      </aside>

      <div className="flex min-h-0 flex-col">
        <div className="min-h-0 flex-1 p-4">
          <div className="mx-auto h-full max-w-4xl">
            <div className="mx-auto h-full max-h-full" style={{ aspectRatio: "16 / 9" }}>
              <SlideCanvas slide={slide} index={currentSlide} total={totalSlides} />
            </div>
          </div>
        </div>

        <div className="shrink-0 px-4 py-3" style={{ borderTop: "1px solid var(--divider)" }}>
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setCurrentSlide((current) => Math.max(0, current - 1))}
              disabled={safeCurrentSlide === 0}
              className="grid h-8 w-8 place-items-center rounded-lg transition-colors"
              style={{ color: safeCurrentSlide === 0 ? "var(--fg-disabled)" : "var(--accent)", background: "var(--surface-low)", border: "1px solid var(--border)" }}
              title="上一页"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>

            <div className="flex min-w-0 flex-1 items-center justify-center gap-2">
              <span className="truncate text-xs font-semibold" style={{ color: "var(--fg-primary)" }}>{slide.title}</span>
              <span className="text-[10px]" style={{ color: "var(--fg-tertiary)" }}>{safeCurrentSlide + 1}/{totalSlides}</span>
              <button
                type="button"
                onClick={() => setShowNotes((value) => !value)}
                className="rounded-md px-2 py-1 text-[10px] font-semibold"
                style={{ color: showNotes ? "var(--accent)" : "var(--fg-tertiary)", background: showNotes ? "var(--accent-subtle)" : "var(--surface-low)", border: "1px solid var(--border)" }}
              >
                备注
              </button>
            </div>

            <button
              type="button"
              onClick={() => setCurrentSlide((current) => Math.min(totalSlides - 1, current + 1))}
              disabled={safeCurrentSlide >= totalSlides - 1}
              className="grid h-8 w-8 place-items-center rounded-lg transition-colors"
              style={{ color: safeCurrentSlide >= totalSlides - 1 ? "var(--fg-disabled)" : "var(--accent)", background: "var(--surface-low)", border: "1px solid var(--border)" }}
              title="下一页"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          </div>

          {showNotes && (
            <div className="mt-3 rounded-lg px-3 py-2 text-xs leading-relaxed" style={{ color: "var(--fg-secondary)", background: "var(--surface-low)", border: "1px solid var(--border)" }}>
              {slide.notes || "当前页暂无备注。"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function SlidesTab({ artifacts }: { artifacts: Artifact[] }) {
  const slidesArtifacts = artifacts.filter(
    (artifact) => artifact.type === "slides" || /\.(ppt|pptx)$/i.test(artifact.filename ?? "") || /\.slides\.(md|json)$/i.test(artifact.filename ?? "")
  );

  if (slidesArtifacts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-xs" style={{ color: "var(--fg-disabled)" }}>暂无幻灯片产物</p>
      </div>
    );
  }

  return <SlidesRenderer artifact={slidesArtifacts[0]} />;
}
