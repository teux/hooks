// import { useEffect } from 'react';

type RefCallback<T> = (node: T | null) => void;

export const useScroll = <T extends HTMLElement = HTMLElement>(): RefCallback<T> => {
    // debugger;
    // window.addEventListener('scroll', () => {});
    alert('foo');
    return () => {};
};
