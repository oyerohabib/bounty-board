"use client";

import { Toaster } from "sonner";
import "sonner/dist/styles.css";

export default function AppToaster() {
  return (
    <Toaster
      theme="light"
      position="bottom-right"
      expand={false}
      visibleToasts={5}
      gap={14}
      offset={16}
      mobileOffset={12}
      toastOptions={{
        duration: Infinity,
        unstyled: true,
        classNames: {
          toast: "font-[family-name:var(--font-body)]",
        },
      }}
    />
  );
}
