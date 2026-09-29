import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#4338ca",
        borderRadius: 36,
      }}
    >
      <svg width="120" height="120" viewBox="0 0 32 32">
        <path
          d="M8 10 L14.5 23 L17 18"
          fill="none"
          stroke="#fff"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M17.5 13.5 H25 M21.25 9.75 V17.25"
          stroke="#fff"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <path d="M18.5 22.5 H25" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
    </div>,
    size,
  );
}
