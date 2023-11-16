import glob from 'glob';
import _ from 'lodash';
import fs from 'node:fs';
import path from 'node:path';

export const getRules = (): readonly string[] => {
  const rulesFiles = glob.sync(path.resolve(__dirname, '../rules/*.js'));

  const rulesNames = rulesFiles
    .map((file) => {
      return path.basename(file, '.js');
    })
    .map((name) => {
      return [name, _.kebabCase(name)];
    });

  return rulesNames;
};

export const isFile = (filepath) => {
  try {
    return fs.statSync(filepath).isFile();
  } catch {
    return false;
  }
};
