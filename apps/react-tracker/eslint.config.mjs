import nx from "@nx/eslint-plugin";
import baseConfig from "../../eslint.config.mjs";

export default [
    ...baseConfig,
    ...nx.configs["flat/react"],
    {
        files: [
            "**/*.ts",
            "**/*.tsx",
            "**/*.js",
            "**/*.jsx"
        ],
        // Override or add rules here
        rules: {
            "@nx/enforce-module-boundaries": [
                "error",
                {
                    "allow": [
                        "^primereact/",
                        "^primeicons/",
                        "^@primevue/"
                    ]
                }
            ]
        }
    }
];
