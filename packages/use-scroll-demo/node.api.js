export default () => ({
    webpack(config) {
        // simple way to compile packages (i.e. @teux/use-scroll) with babel
        config.module.rules[0].oneOf[0].include.push(new RegExp('packages'));
        return config;
    },
});
