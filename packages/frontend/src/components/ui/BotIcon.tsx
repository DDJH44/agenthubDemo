"use client";

import type { HTMLAttributes, MouseEvent } from "react";
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";
import type { Variants } from "framer-motion";
import { motion, useAnimation } from "framer-motion";

export interface BotIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface BotIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

const EYE_VARIANT: Variants = {
  normal: { y1: 13, y2: 15 },
  animate: {
    y1: [13, 14, 13],
    y2: [15, 14, 15],
    transition: {
      delay: 0.12,
      duration: 0.46,
      ease: "easeInOut",
    },
  },
};

export const BotIcon = forwardRef<BotIconHandle, BotIconProps>(function BotIcon(
  { onMouseEnter, onMouseLeave, className, size = 20, ...props },
  ref,
) {
  const controls = useAnimation();
  const isControlledRef = useRef(false);

  useImperativeHandle(ref, () => {
    isControlledRef.current = true;

    return {
      startAnimation: () => controls.start("animate"),
      stopAnimation: () => controls.start("normal"),
    };
  });

  const handleMouseEnter = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (!isControlledRef.current) {
        void controls.start("animate");
      }
      onMouseEnter?.(event);
    },
    [controls, onMouseEnter],
  );

  const handleMouseLeave = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (!isControlledRef.current) {
        void controls.start("normal");
      }
      onMouseLeave?.(event);
    },
    [controls, onMouseLeave],
  );

  return (
    <div
      className={className}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      {...props}
    >
      <svg
        fill="none"
        height={size}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        viewBox="0 0 24 24"
        width={size}
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M12 8V4H8" />
        <rect height="12" rx="2" width="16" x="4" y="8" />
        <path d="M2 14h2" />
        <path d="M20 14h2" />
        <motion.line
          animate={controls}
          initial="normal"
          variants={EYE_VARIANT}
          x1={15}
          x2={15}
        />
        <motion.line
          animate={controls}
          initial="normal"
          variants={EYE_VARIANT}
          x1={9}
          x2={9}
        />
      </svg>
    </div>
  );
});
