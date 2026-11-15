import React, { useState, useEffect } from "react";
import { cn } from "../../lib/utils";

const Avatar = React.forwardRef(({ className, src, alt, fallback, size = "md", ...props }, ref) => {
    const sizes = {
        xs: "h-6 w-6 text-[10px]",
        sm: "h-8 w-8 text-[11px]",
        md: "h-11 w-11 text-[13px]",
        lg: "h-14 w-14 text-[15px]",
        xl: "h-20 w-20 text-[18px]",
        "2xl": "h-32 w-32 text-[24px]",
        "3xl": "h-40 w-40 text-[32px]",
    };

    const [hasError, setHasError] = useState(false);

    useEffect(() => {
        setHasError(false);
    }, [src]);

    const initial = (alt || fallback || "U").trim().charAt(0).toUpperCase();

    return (
        <div
            ref={ref}
            className={cn(
                "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-elevated border border-border/50 shadow-sm select-none",
                sizes[size] || sizes.md,
                className
            )}
            {...props}
        >
            {src && !hasError ? (
                <img
                    key={src}
                    src={src}
                    alt={alt || "Avatar"}
                    loading="lazy"
                    decoding="async"
                    className="aspect-square h-full w-full object-cover"
                    onError={() => setHasError(true)}
                />
            ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-tr from-primary/20 to-primary/40 text-primary font-bold">
                    {initial}
                </div>
            )}
        </div>
    );
});
Avatar.displayName = "Avatar";

export { Avatar };
