/* eslint-disable complexity */
/* eslint-disable func-style */

import { createRule } from '../utilities';
import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';

/**
 * @file Rule to flag non-matching identifiers
 * @author Matthieu Larcher
 *
 * Adapted from https://github.com/eslint/eslint/blob/c4fffbcb089182d425ef1d5e45134fecc0e2da46/lib/rules/id-match.js
 * Related discussion about not adding this option to ESLint https://github.com/eslint/eslint/issues/14005
 */

/**
 * Checks if a parent of a node is an ObjectPattern.
 *
 * @returns {boolean} if the node is inside an ObjectPattern
 * @private
 */
const isInsideObjectPattern = (node: TSESTree.Node) => {
  let { parent } = node;

  while (parent) {
    if (parent.type === 'ObjectPattern') {
      return true;
    }

    parent = parent.parent;
  }

  return false;
};

const defaultOptions = {
  classFields: false,
  ignoreDestructuring: false,
  ignoreNamedImports: false,
  onlyDeclarations: false,
  properties: false,
};

type Options =
  | [
      string,
      {
        classFields?: boolean;
        ignoreDestructuring?: boolean;
        ignoreNamedImports?: boolean;
        onlyDeclarations?: boolean;
        properties?: boolean;
      },
    ]
  | [string];

type MessageIds = 'notMatch' | 'notMatchPrivate';

export default createRule<Options, MessageIds>({
  create: (context, [inputPattern, options]) => {
    const pattern = inputPattern ?? '^.+$';

    const regexp = new RegExp(pattern, 'u');

    const checkProperties = Boolean(options?.properties);
    const checkClassFields = Boolean(options?.classFields);
    const onlyDeclarations = Boolean(options?.onlyDeclarations);
    const ignoreDestructuring = Boolean(options?.ignoreDestructuring);
    const ignoreNamedImports = Boolean(options?.ignoreNamedImports);

    // Contains reported nodes to avoid reporting twice on destructuring with shorthand notation
    const reportedNodes = new Set();

    const ALLOWED_PARENT_TYPES = new Set(['CallExpression', 'NewExpression']);

    const DECLARATION_TYPES = new Set([
      'FunctionDeclaration',
      'VariableDeclarator',
    ]);

    const IMPORT_TYPES = new Set([
      'ImportSpecifier',
      'ImportNamespaceSpecifier',
      'ImportDefaultSpecifier',
    ]);

    /**
     * Checks if a string matches the provided pattern
     *
     * @param {string} name The string to check.
     * @returns {boolean} if the string is a match
     * @private
     */
    const isInvalid = (name) => {
      return !regexp.test(name);
    };

    /**
     * Verifies if we should report an error or not based on the effective
     * parent node and the identifier name.
     *
     * @param {ASTNode} effectiveParent The effective parent node of the node to be reported
     * @param {string} name The identifier name of the identifier node
     * @returns {boolean} whether an error should be reported or not
     */
    const shouldReport = (effectiveParent, name: string) => {
      return (
        (!onlyDeclarations || DECLARATION_TYPES.has(effectiveParent.type)) &&
        !ALLOWED_PARENT_TYPES.has(effectiveParent.type) &&
        isInvalid(name)
      );
    };

    /**
     * Reports an AST node as a rule violation.
     *
     * @param {ASTNode} node The node to report.
     * @returns {void}
     * @private
     */
    const report = (node) => {
      /*
       * We used the range instead of the node because it's possible
       * for the same identifier to be represented by two different
       * nodes, with the most clear example being shorthand properties:
       * { foo }
       * In this case, "foo" is represented by one node for the name
       * and one for the value. The only way to know they are the same
       * is to look at the range.
       */
      if (!reportedNodes.has(node.range.toString())) {
        const messageId =
          node.type === AST_NODE_TYPES.PrivateIdentifier
            ? 'notMatchPrivate'
            : 'notMatch';

        context.report({
          data: {
            name: node.name,
            pattern,
          },
          messageId,
          node,
        });
        reportedNodes.add(node.range.toString());
      }
    };

    return {
      Identifier(node) {
        const { name } = node;
        const { parent } = node;

        if (!parent) {
          return;
        }

        const effectiveParent =
          parent.type === AST_NODE_TYPES.MemberExpression
            ? parent.parent
            : parent;

        if (!effectiveParent) {
          return;
        }

        if (parent.type === AST_NODE_TYPES.MemberExpression) {
          if (!checkProperties) {
            return;
          }

          if (
            parent.object.type === AST_NODE_TYPES.Identifier &&
            parent.object.name === name
          ) {
            if (isInvalid(name)) {
              report(node);
            }

            // Report AssignmentExpressions left side's assigned variable id
          } else if (
            effectiveParent.type === AST_NODE_TYPES.AssignmentExpression &&
            effectiveParent.left.type === AST_NODE_TYPES.MemberExpression &&
            effectiveParent.left.property.type === AST_NODE_TYPES.Identifier &&
            effectiveParent.left.property.name === node.name
          ) {
            if (isInvalid(name)) {
              report(node);
            }

            // Report AssignmentExpressions only if they are the left side of the assignment
          } else if (
            effectiveParent.type === AST_NODE_TYPES.AssignmentExpression &&
            effectiveParent.right.type !== AST_NODE_TYPES.MemberExpression &&
            isInvalid(name)
          ) {
            report(node);
          }

          /*
           * Properties have their own rules, and
           * AssignmentPattern nodes can be treated like Properties:
           * e.g.: const { no_camelcased = false } = bar;
           */
        } else if (
          parent.type === AST_NODE_TYPES.Property ||
          parent.type === AST_NODE_TYPES.AssignmentPattern
        ) {
          if (parent.parent?.type === AST_NODE_TYPES.ObjectPattern) {
            if (
              !ignoreDestructuring &&
              'shorthand' in parent &&
              parent.shorthand &&
              'left' in parent.value &&
              parent.value.left &&
              isInvalid(name)
            ) {
              report(node);
            }

            if (!('key' in parent)) {
              throw new Error('OK');
            }

            const assignmentKeyEqualsValue =
              'name' in parent.value &&
              'name' in parent.key &&
              parent.key.name === parent.value.name;

            // Prevent checking right-hand side of destructured object
            if (!assignmentKeyEqualsValue && parent.key === node) {
              return;
            }

            const valueIsInvalid =
              'name' in parent.value && parent.value.name && isInvalid(name);

            // ignore destructuring if the option is set, unless a new identifier is created
            if (
              valueIsInvalid &&
              !(assignmentKeyEqualsValue && ignoreDestructuring)
            ) {
              report(node);
            }
          }

          // Never check properties or always ignore destructuring
          if (
            !checkProperties ||
            (ignoreDestructuring && isInsideObjectPattern(node))
          ) {
            return;
          }

          // Don't check right hand side of AssignmentExpression to prevent duplicate warnings
          if (
            (!('right' in parent) || parent.right !== node) &&
            shouldReport(effectiveParent, name)
          ) {
            report(node);
          }

          // Check if it's an import specifier
        } else if (IMPORT_TYPES.has(parent.type)) {
          if (
            ignoreNamedImports &&
            parent.type === AST_NODE_TYPES.ImportSpecifier
          ) {
            // Ignore named import
          } else if (
            'local' in parent &&
            parent.local.name === node.name &&
            isInvalid(name)
          ) {
            // Report only if the local imported identifier is invalid
            report(node);
          }
        } else if (parent.type === AST_NODE_TYPES.PropertyDefinition) {
          if (checkClassFields && isInvalid(name)) {
            report(node);
          }

          // Report anything that is invalid that isn't a CallExpression
        } else if (shouldReport(effectiveParent, name)) {
          report(node);
        }
      },
    };
  },
  defaultOptions: ['^.+$', defaultOptions],
  meta: {
    docs: {
      description:
        'require identifiers to match a specified regular expression',
    },
    messages: {
      notMatch:
        "Identifier '{{name}}' does not match the pattern '{{pattern}}'.",
      notMatchPrivate:
        "Identifier '#{{name}}' does not match the pattern '{{pattern}}'.",
    },
    schema: [
      {
        type: 'string',
      },
      {
        additionalProperties: false,
        properties: {
          classFields: {
            default: false,
            type: 'boolean',
          },
          ignoreDestructuring: {
            default: false,
            type: 'boolean',
          },
          ignoreNamedImports: {
            default: false,
            type: 'boolean',
          },
          onlyDeclarations: {
            default: false,
            type: 'boolean',
          },
          properties: {
            default: false,
            type: 'boolean',
          },
        },
        type: 'object',
      },
    ],
    type: 'suggestion',
  },
  name: 'id-match',
});
