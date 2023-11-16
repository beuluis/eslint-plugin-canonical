/**
 * @file This script is used to inline assertions into the README.md documents.
 */

import glob from 'glob';
import _ from 'lodash';
import fs from 'node:fs';
import path from 'node:path';

const formatCodeSnippet = (setup) => {
  const paragraphs: string[] = [];

  if (setup.options) {
    paragraphs.push('// Options: ' + JSON.stringify(setup.options));
  }

  if (setup.settings) {
    paragraphs.push('// Settings: ' + JSON.stringify(setup.settings));
  }

  paragraphs.push(setup.code);

  if (setup.errors) {
    for (const message of setup.errors) {
      paragraphs.push('// Message: ' + message.message);
    }
  }

  if (setup.rules) {
    paragraphs.push('// Additional rules: ' + JSON.stringify(setup.rules));
  }

  return paragraphs.join('\n');
};

const getAssertions = () => {
  const assertionFiles = glob.sync(
    path.resolve(__dirname, '../../tests/rules/*.ts'),
  );

  const assertionNames = _.map(assertionFiles, (filePath) => {
    return path.basename(filePath, '.ts');
  });

  const assertionCodes = _.map(assertionFiles, (filePath) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const codes = require(filePath);

    return {
      invalid: _.map(codes.default.testCases.invalid, formatCodeSnippet),
      valid: _.map(codes.default.testCases.valid, formatCodeSnippet),
    };
  });

  return _.zipObject(assertionNames, assertionCodes);
};

const updateDocuments = (assertions) => {
  const readmeDocumentPath = path.join(__dirname, '../../README.md');
  let documentBody;

  documentBody = fs.readFileSync(readmeDocumentPath, 'utf8');

  documentBody = documentBody.replaceAll(
    /<!-- assertions ([a-z]+?) -->/giu,
    (assertionsBlock) => {
      let exampleBody;

      const ruleName = assertionsBlock.match(/assertions ([a-z]+)/iu)[1];

      const ruleAssertions = assertions[ruleName];

      if (!ruleAssertions) {
        throw new Error('No assertions available for rule "' + ruleName + '".');
      }

      exampleBody = '';

      if (ruleAssertions.invalid.length) {
        exampleBody +=
          'The following patterns are considered problems:\n\n```js\n' +
          ruleAssertions.invalid.join('\n\n') +
          '\n```\n\n';
      }

      if (ruleAssertions.valid.length) {
        exampleBody +=
          'The following patterns are not considered problems:\n\n```js\n' +
          ruleAssertions.valid.join('\n\n') +
          '\n```\n\n';
      }

      return `<details><summary>📖 Examples</summary>\n${exampleBody}</details>\n`;
    },
  );

  fs.writeFileSync(readmeDocumentPath, documentBody);
};

updateDocuments(getAssertions());
