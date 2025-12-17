const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

/**@type {import('webpack').Configuration}*/
const config = {
    target: 'node',
    mode: 'none',

    entry: './src/extension.ts',
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'extension.js',
        libraryTarget: 'commonjs2'
    },
    externals: {
        vscode: 'commonjs vscode'
    },
    resolve: {
        extensions: ['.ts', '.js']
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                exclude: /node_modules/,
                use: [
                    {
                        loader: 'ts-loader'
                    }
                ]
            },
            {
                test: /\.css$/,
                use: ['style-loader', 'css-loader']
            }
        ]
    },
    plugins: [
        new CopyPlugin({
            patterns: [
                { from: 'resources', to: 'resources' },
                // Copy marked.js for webview use (with sanitization enabled)
                { from: 'node_modules/marked/marked.min.js', to: 'libs/marked.min.js' }
            ]
        })
    ],
    devtool: 'nosources-source-map',
    infrastructureLogging: {
        level: 'log'
    }
};

module.exports = config;
