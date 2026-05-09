"use client";
import { useEffect, useState } from "react";

export interface VisualViewportState {
    height: number;
    offsetTop: number;
    keyboardOpen: boolean;
}

export function useVisualViewport(): VisualViewportState {
    const [state, setState] = useState<VisualViewportState>(() => ({
        height: typeof window === "undefined" ? 0 : window.innerHeight,
        offsetTop: 0,
        keyboardOpen: false,
    }));

    useEffect(() => {
        const vv = window.visualViewport;

        const apply = () => {
            const h = vv?.height ?? window.innerHeight;
            const top = vv?.offsetTop ?? 0;
            const layoutH = window.innerHeight;
            const keyboardOpen = layoutH - h > 150 || top > 0;
            setState({ height: h, offsetTop: top, keyboardOpen });
        };

        apply();
        if (vv) {
            vv.addEventListener("resize", apply);
            vv.addEventListener("scroll", apply);
        }
        window.addEventListener("resize", apply);
        return () => {
            if (vv) {
                vv.removeEventListener("resize", apply);
                vv.removeEventListener("scroll", apply);
            }
            window.removeEventListener("resize", apply);
        };
    }, []);

    return state;
}
