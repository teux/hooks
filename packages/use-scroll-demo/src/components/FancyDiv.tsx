import React from 'react';

const FancyDiv: React.ComponentType = ({ children }) => (
    <div style={{ border: '1px solid red' }}>{children}</div>
);
export default FancyDiv;
