export default () => ({
    webpack(config) {
        // to compile packages (i.e. @teux/use-scroll) by babel
        const rule = config.module && config.module.rules && config.module.rules[0];
        if (rule && rule.oneOf && rule.oneOf[0]) {
            const { include } = rule.oneOf[0];
            include.push(new RegExp('packages'));
        }
        return config;
    },
});
