/* eslint-disable @typescript-eslint/no-require-imports */
const path = require('path');
const webpack = require('webpack');
const CopyPlugin = require('copy-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

// Load .env if present (BACKEND_URL, AZURE_CLIENT_ID)
try { require('dotenv').config(); } catch {}

module.exports = (_env, _argv) => ({
  entry: {
    popup:      './src/popup/popup.ts',
    background: './src/background/background.ts',
    content:    './src/content/content.ts',
  },

  output: {
    path:     path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    clean:    true,
  },

  module: {
    rules: [
      {
        test:    /\.tsx?$/,
        use:     'ts-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.css$/,
        use:  [MiniCssExtractPlugin.loader, 'css-loader'],
      },
    ],
  },

  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },

  plugins: [
    new webpack.DefinePlugin({
      'process.env.BACKEND_URL':    JSON.stringify(process.env.BACKEND_URL    || ''),
      'process.env.AZURE_CLIENT_ID': JSON.stringify(process.env.AZURE_CLIENT_ID || ''),
    }),
    new MiniCssExtractPlugin({ filename: '[name].css' }),
    new CopyPlugin({
      patterns: [
        { from: 'manifest.json',        to: 'manifest.json' },
        { from: 'src/popup/popup.html', to: 'popup.html' },
        { from: 'icons',                to: 'icons', noErrorOnMissing: true },
      ],
    }),
  ],

  // Each entry must be a self-contained bundle for the extension runtime
  optimization: { splitChunks: false },
});
