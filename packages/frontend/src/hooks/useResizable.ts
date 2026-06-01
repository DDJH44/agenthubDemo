"use client";

import { useState, useCallback, useEffect } from "react";

interface UseResizableOptions {
  initialSize: number;
  minSize: number;
  maxSize: number;
  direction: "left" | "right";
}

export function useResizable({ initialSize, minSize, maxSize, direction }: UseResizableOptions) {
  const [size, setSize] = useState(initialSize);
  const [dragging, setDragging] = useState(false);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  useEffect(() => {
    if (!dragging) return;

    const onMouseMove = (e: MouseEvent) => {
      const newSize = direction === "left"
        ? e.clientX
        : window.innerWidth - e.clientX;
      setSize(Math.max(minSize, Math.min(maxSize, newSize)));
    };

    const onMouseUp = () => setDragging(false);

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [dragging, direction, minSize, maxSize]);

  return { size, minSize, maxSize, dragging, onMouseDown };
}
