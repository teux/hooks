declare module '*.svg' {
    import { ComponentType, SVGAttributes } from 'react';

    const content: ComponentType<SVGAttributes<SVGElement>>;
    export default content;
}

declare module '*.json' {
    const content: { [key: string]: unknown };
    export default content;
}

declare module '*.png' {
    const content: string;
    export default content;
}
