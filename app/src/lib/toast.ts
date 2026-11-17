"use client";

import { toast } from "sonner";
import { createElement } from "react";
import { PersistToast } from "@/components/PersistToast";

let nextOrdinal = 0;

type NotifyOpts = {
  id?: string | number;
};

function show(
  variant: "success" | "error" | "warning",
  title: string,
  description?: string,
  opts?: NotifyOpts
) {
  const ordinal = ++nextOrdinal;
  return toast.custom(
    (id) =>
      createElement(PersistToast, {
        toastId: id,
        ordinal,
        variant,
        title,
        description,
        onClose: () => toast.dismiss(id),
      }),
    {
      duration: Infinity,
      id: opts?.id,
    }
  );
}

export function notifySuccess(
  title: string,
  description?: string,
  opts?: NotifyOpts
) {
  return show("success", title, description, opts);
}

export function notifyError(
  title: string,
  description?: string,
  opts?: NotifyOpts
) {
  return show("error", title, description, opts);
}

export function notifyWarning(
  title: string,
  description?: string,
  opts?: NotifyOpts
) {
  return show("warning", title, description, opts);
}

export function dismissToast(id: string | number) {
  toast.dismiss(id);
}
