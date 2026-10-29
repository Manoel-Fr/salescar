const { jestConfig } = require('@salesforce/sfdx-lwc-jest/config');

module.exports = {
    ...jestConfig,
    moduleNameMapper: {
        ...jestConfig.moduleNameMapper,
        // Módulo só de CSS (sem .js): o resolver do Jest precisa do caminho explícito.
        '^c/salesCarStyles$': '<rootDir>/force-app/main/default/lwc/salesCarStyles/salesCarStyles.css'
    },
    modulePathIgnorePatterns: ['<rootDir>/.localdevserver']
};
