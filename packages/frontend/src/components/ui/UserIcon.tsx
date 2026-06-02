"use client";

import type { HTMLAttributes, MouseEvent } from "react";
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";
import type { Variants } from "framer-motion";
import { motion, useAnimation } from "framer-motion";

export interface UserIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface UserIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

const PATH_VARIANT: Variants = {
  normal: { pathLength: 1, opacity: 1, pathOffset: 0 },
  animate: {
    pathLength: [0.18, 1],
    opacity: [0.55, 1],
    pathOffset: [0.45, 0],
  },
};

const CIRCLE_VARIANT: Variants = {
  normal: {
    pathLength: 1,
    pathOffset: 0,
    scale: 1,
  },
  animate: {
    pathLength: [0.25, 1],
    pathOffset: [0.35, 0],
    scale: [0.82, 1],
  },
};

export const UserIcon = forwardRef<UserIconHandle, UserIconProps>(function UserIcon(
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
      if (isControlledRef.current) {
        onMouseEnter?.(event);
        return;
      }
      void controls.start("animate");
      onMouseEnter?.(event);
    },
    [controls, onMouseEnter],
  );

  const handleMouseLeave = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (isControlledRef.current) {
        onMouseLeave?.(event);
        return;
      }
      void controls.start("normal");
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
        <motion.circle
          animate={controls}
          cx="12"
          cy="8"
          initial="normal"
          r="5"
          transition={{ duration: 0.35 }}
          variants={CIRCLE_VARIANT}
        />
        <motion.path
          animate={controls}
          d="M20 21a8 8 0 0 0-16 0"
          initial="normal"
          transition={{ delay: 0.14, duration: 0.35 }}
          variants={PATH_VARIANT}
        />
      </svg>
    </div>
  );
});
