import React from 'react';
import { useScroll } from '@teux/use-scroll';

export default () => {
    useScroll();

    return (
        <div style={{ textAlign: 'center' }}>
            <h1>
                Welcome to React-Static
                {' '}
                <br />
                {' '}
                + TypeScript
            </h1>
            <p>
                Learn
                {' '}
                <a href="https://github.com/sw-yx/react-typescript-cheatsheet">
                    React + TypeScript
                </a>
            </p>
            <p>
                <a href="https://twitter.com/swyx">
                    Report issues with this template
                </a>
            </p>
        </div>
    );
};
