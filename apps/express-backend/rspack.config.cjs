const { withNx } = require('@nx/rspack');
const { composePlugins } = require('@nx/rspack');

// Nx plugins for webpack.
const config = composePlugins(
  withNx({
    optimization: true,
    statsJson: true,
  }),
  (config) => {
    config.node = {
      __dirname: false,
      __filename: false,
    };

    // Ensure we have proper source maps
    config.devtool = 'source-map';

    return config;
  },
);

module.exports = config;
