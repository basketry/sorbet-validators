import {
  isRequired,
  Parameter,
  Property,
  ReturnType,
  Service,
  ValidationRule,
} from 'basketry';
import { snake, constant } from 'case';
import { buildTypeName } from '@basketry/sorbet';
import { block, indent } from './utils';
import { SorbetValidatorOptions } from './types';

const errorArrayName = snake('validator_internal_errors');

export type GuardClauseFactory = (
  param: Parameter | Property,
  rule: ValidationRule,
  errorType: string,
  service: Service,
  options: SorbetValidatorOptions | undefined,
  typeName?: string,
) => Iterable<string>;

export type RulelessGuardClauseFactory = (
  param: Parameter | Property,
  errorType: string,
  service: Service,
  options: SorbetValidatorOptions | undefined,
  typeName?: string,
) => Iterable<string>;

function buildName(parent: string | undefined, child: string) {
  return [parent, child]
    .filter((x) => x)
    .map(snake)
    .join('.');
}

export function* buildError(
  code: string,
  title: string,
  path: string,
  errorType: string,
  options?: {
    skipPush?: boolean;
    trailingComma?: boolean;
  },
): Iterable<string> {
  const skipPush =
    typeof options?.skipPush === 'boolean' ? options.skipPush : false;
  const trailingComma =
    typeof options?.trailingComma === 'boolean' ? options.trailingComma : false;

  yield `${skipPush ? '' : `${errorArrayName} << `}${errorType}.new(`;
  yield* indent(function* () {
    yield `code: '${constant(code)}',`;
    yield `title: '${title}',`;
    yield `path: '${path}'`;
  });
  yield `)${trailingComma ? ',' : ''}`;
}

function buildMessage(param: Parameter | Property, message: string): string {
  return param.isArray ? `Each item in ${message}` : message;
}

function buildConditions(
  typeName: string | undefined,
  param: Parameter | Property,
  conditions: (n: string) => string[],
): string[] {
  if (param.isArray) {
    return [
      `${buildName(typeName, param.name.value)}.is_a?(Array)`,
      `!${buildName(typeName, param.name.value)}.any? { |x| ${conditions(
        'x',
      ).join(' && ')} }`,
    ];
  } else {
    return conditions(param.name.value);
  }
}

function must(
  item: { rules: ValidationRule[] },
  value: string,
  skip: boolean = false,
) {
  return skip || isRequired(item) ? value : `T.must(${value})`;
}

function buildValidatorName(
  type: Parameter | Property | ReturnType,
  service: Service,
  options: SorbetValidatorOptions | undefined,
): string {
  const x = buildTypeName({ type, service, options, skipArrayify: true }).split(
    '::',
  );

  return `validate_${snake(x[x.length - 1])}`;
}

const buildRequiredClause: RulelessGuardClauseFactory = function* (
  param,
  errorType,
  service,
  options,
  typeName,
) {
  if (options?.sorbet?.runtime !== false && isRequired(param)) {
    yield '';
    yield `# required`;
    yield* block(
      `if T.unsafe(${buildName(typeName, param.name.value)}).nil?`,
      function* () {
        yield* buildError(
          'required',
          `"${buildName(typeName, param.name.value)}" is required`,
          buildName(typeName, param.name.value),
          errorType,
        );
      },
    );
  }
};

const buildPrimitiveTypeCheckClause: RulelessGuardClauseFactory = function* (
  param,
  errorType,
  service,
  options,
  typeName,
) {
  if (options?.sorbet?.runtime !== false && param.isPrimitive) {
    const rootTypeName = buildTypeName({
      type: param,
      service,
      options,
      skipArrayify: true,
    });
    const paramName = buildName(typeName, param.name.value);
    const unsafe = `T.unsafe(${paramName})`;

    const conditions =
      param.isArray && rootTypeName === 'T::Boolean'
        ? [
            `${paramName}.is_a?(Array)`,
            `${paramName}.any? { |x| !x.is_a?(TrueClass) && !x.is_a?(FalseClass) }`,
          ]
        : param.isArray && rootTypeName !== 'T::Boolean'
        ? [
            `${paramName}.is_a?(Array)`,
            `${paramName}.any? { |x| !x.is_a?(${rootTypeName}) }`,
          ]
        : rootTypeName === 'T::Boolean'
        ? [
            `!${unsafe}.nil?`,
            `!${unsafe}.is_a?(TrueClass)`,
            `!${unsafe}.is_a?(FalseClass)`,
          ]
        : [`!${unsafe}.nil?`, `!${unsafe}.is_a?(${rootTypeName})`];

    const message = `"${buildName(
      typeName,
      param.name.value,
    )}" must be a ${rootTypeName}`;

    yield '';
    yield `# "non-local" type check`;
    yield* block(
      `if ${conditions.join(' && ')}`,
      buildError(
        'type',
        buildMessage(
          param,
          `${message}${isRequired(param) ? '' : ` if supplied`}`,
        ),
        paramName,
        errorType,
      ),
    );
  }
  return;
};

const buildCustomTypeCheckClause: RulelessGuardClauseFactory = function* (
  param,
  errorType,
  service,
  options,
  typeName,
) {
  if (!param.isPrimitive) {
    const name = buildName(typeName, param.name.value);
    const unsafe = isRequired(param) ? `T.unsafe(${name})` : name;
    const fn = buildValidatorName(param, service, options);

    yield '';
    yield '# local type check';
    if (options?.sorbet?.runtime !== false) {
      if (param.isArray) {
        if (isRequired(param)) {
          yield* block(`if !${unsafe}.nil?`, function* () {
            yield `${
              typeName ? must(param, name) : name
            }.each { |x| ${errorArrayName}.concat(${fn}(x)) }`;
          });
        } else {
          yield `${
            typeName ? must(param, name) : name
          }&.each { |x| ${errorArrayName}.concat(${fn}(x)) }`;
        }
      } else {
        yield* block(`if !${unsafe}.nil?`, function* () {
          yield `${errorArrayName}.concat(${fn}(${typeName ? must(param, name) : name}))`;
        });
      }
    } else {
      if (param.isArray) {
        yield `${name}.each { |x| ${errorArrayName}.concat(${fn}(x)) }`;
      } else {
        yield `${errorArrayName}.concat(${fn}(${
          typeName ? must(param, name) : name
        }))`;
      }
    }
  }
  return;
};

export const rulelessFactories = [
  buildRequiredClause,
  buildPrimitiveTypeCheckClause,
  buildCustomTypeCheckClause,
];

export const buildStringMaxLengthClause: GuardClauseFactory = function* (
  param,
  rule,
  errorType,
  service,
  options,
  typeName,
) {
  if (rule.id === 'string-max-length') {
    const conditions = buildConditions(typeName, param, (name: string) => [
      `${buildName(typeName, name)}.is_a?(String)`,
      `${must(param, buildName(typeName, name))}.length > ${rule.length.value}`,
    ]);

    yield '';
    yield `# ${rule.id}`;
    yield* block(
      `if ${conditions.join(' && ')}`,
      buildError(
        rule.id,
        `"${buildName(typeName, param.name.value)}" max length is ${
          rule.length.value
        }`,
        buildName(typeName, param.name.value),
        errorType,
      ),
    );
  }
  return;
};

export const buildStringMinLengthClause: GuardClauseFactory = function* (
  param,
  rule,
  errorType,
  service,
  options,
  typeName,
) {
  if (rule.id === 'string-min-length') {
    const conditions = buildConditions(typeName, param, (name: string) => [
      `${buildName(typeName, name)}.is_a?(String)`,
      `${must(param, buildName(typeName, name))}.length < ${rule.length.value}`,
    ]);

    yield '';
    yield `# ${rule.id}`;
    yield* block(
      `if ${conditions.join(' && ')}`,
      buildError(
        rule.id,
        `"${buildName(typeName, param.name.value)}" min length is ${
          rule.length.value
        }`,
        buildName(typeName, param.name.value),
        errorType,
      ),
    );
  }
  return;
};

export const buildStringPatternClause: GuardClauseFactory = function* (
  param,
  rule,
  errorType,
  service,
  options,
  typeName,
) {
  if (rule.id === 'string-pattern') {
    const conditions = buildConditions(typeName, param, (name: string) => [
      `${buildName(typeName, name)}.is_a?(String)`,
      `/${rule.pattern.value}/.match?(${buildName(typeName, name)})`,
    ]);

    yield '';
    yield `# ${rule.id}`;
    yield* block(
      `if ${conditions.join(' && ')}`,
      buildError(
        rule.id,
        `"${buildName(typeName, param.name.value)}" must match the pattern /${
          rule.pattern.value
        }/`,
        buildName(typeName, param.name.value),
        errorType,
      ),
    );
  }
  return;
};

export const buildNumberMultipleOfClause: GuardClauseFactory = function* (
  param,
  rule,
  errorType,
  service,
  options,
  typeName,
) {
  if (rule.id === 'number-multiple-of') {
    const skipMust = !typeName && !options?.sorbet?.runtime;
    const conditions = buildConditions(typeName, param, (name: string) => [
      `${buildName(typeName, name)}.is_a?(Numeric)`,
      `${must(param, buildName(typeName, name), skipMust)} % ${
        rule.value.value
      } != 0`,
    ]);

    yield '';
    yield `# ${rule.id}`;
    yield* block(`if ${conditions.join(' && ')}`, function* () {
      yield* buildError(
        rule.id,
        `"${buildName(typeName, param.name.value)}" must be a multiple of ${
          rule.value.value
        }`,
        buildName(typeName, param.name.value),
        errorType,
      );
    });
  }
  return;
};

export const buildNumberGreaterThanClause: GuardClauseFactory = function* (
  param,
  rule,
  errorType,
  service,
  options,
  typeName,
) {
  if (rule.id === 'number-gt') {
    const skipMust = !typeName && !options?.sorbet?.runtime;
    const conditions = buildConditions(typeName, param, (name: string) => [
      `${buildName(typeName, name)}.is_a?(Numeric)`,
      `${must(param, buildName(typeName, name), skipMust)} <= ${
        rule.value.value
      }`,
    ]);

    yield '';
    yield `# ${rule.id}`;
    yield* block(`if ${conditions.join(' && ')}`, function* () {
      yield* buildError(
        rule.id,
        `"${buildName(typeName, param.name.value)}" must be greater than ${
          rule.value.value
        }`,
        buildName(typeName, param.name.value),
        errorType,
      );
    });
  }
  return;
};

export const buildNumberGreaterOrEqualClause: GuardClauseFactory = function* (
  param,
  rule,
  errorType,
  service,
  options,
  typeName,
) {
  if (rule.id === 'number-gte') {
    const skipMust = !typeName && !options?.sorbet?.runtime;
    const conditions = buildConditions(typeName, param, (name: string) => [
      `${buildName(typeName, name)}.is_a?(Numeric)`,
      `${must(param, buildName(typeName, name), skipMust)} < ${
        rule.value.value
      }`,
    ]);

    yield '';
    yield `# ${rule.id}`;
    yield* block(`if ${conditions.join(' && ')}`, function* () {
      yield* buildError(
        rule.id,
        `"${buildName(
          typeName,
          param.name.value,
        )}" must be greater than or equal to ${rule.value.value}`,
        buildName(typeName, param.name.value),
        errorType,
      );
    });
  }
  return;
};

export const buildNumberLessThanClause: GuardClauseFactory = function* (
  param,
  rule,
  errorType,
  service,
  options,
  typeName,
) {
  if (rule.id === 'number-lt') {
    const skipMust = !typeName && !options?.sorbet?.runtime;
    const conditions = buildConditions(typeName, param, (name: string) => [
      `${buildName(typeName, name)}.is_a?(Numeric)`,
      `${must(param, buildName(typeName, name), skipMust)} >= ${
        rule.value.value
      }`,
    ]);

    yield '';
    yield `# ${rule.id}`;
    yield* block(`if ${conditions.join(' && ')}`, function* () {
      yield* buildError(
        rule.id,
        `"${buildName(typeName, param.name.value)}" must be less than ${
          rule.value.value
        }`,
        buildName(typeName, param.name.value),
        errorType,
      );
    });
  }
  return;
};

export const buildNumberLessOrEqualClause: GuardClauseFactory = function* (
  param,
  rule,
  errorType,
  service,
  options,
  typeName,
) {
  if (rule.id === 'number-lte') {
    const skipMust = !typeName && !options?.sorbet?.runtime;
    const conditions = buildConditions(typeName, param, (name: string) => [
      `${buildName(typeName, name)}.is_a?(Numeric)`,
      `${must(param, buildName(typeName, name), skipMust)} > ${
        rule.value.value
      }`,
    ]);

    yield '';
    yield `# ${rule.id}`;
    yield* block(`if ${conditions.join(' && ')}`, function* () {
      yield* buildError(
        rule.id,
        `"${buildName(
          typeName,
          param.name.value,
        )}" must be less than or equal to ${rule.value.value}`,
        buildName(typeName, param.name.value),
        errorType,
      );
    });
  }
  return;
};

export const buildArrayMaxItemsClause: GuardClauseFactory = function* (
  param,
  rule,
  errorType,
  service,
  options,
  typeName,
) {
  if (rule.id === 'array-max-items') {
    const conditions = [
      `${buildName(typeName, param.name.value)}.is_a?(Array)`,
      `${buildName(typeName, param.name.value)}.length > ${rule.max.value}`,
    ];

    yield '';
    yield `# ${rule.id}`;
    yield* block(`if ${conditions.join(' && ')}`, function* () {
      yield* buildError(
        rule.id,
        `"${buildName(typeName, param.name.value)}" max length is ${
          rule.max.value
        }`,
        buildName(typeName, param.name.value),
        errorType,
      );
    });
  }
  return;
};

export const buildArrayMinItemsClause: GuardClauseFactory = function* (
  param,
  rule,
  errorType,
  service,
  options,
  typeName,
) {
  if (rule.id === 'array-min-items') {
    const conditions = [
      `${buildName(typeName, param.name.value)}.is_a?(Array)`,
      `${buildName(typeName, param.name.value)}.length < ${rule.min.value}`,
    ];

    yield '';
    yield `# ${rule.id}`;
    yield* block(`if ${conditions.join(' && ')}`, function* () {
      yield* buildError(
        rule.id,
        `"${buildName(typeName, param.name.value)}" min length is ${
          rule.min.value
        }`,
        buildName(typeName, param.name.value),
        errorType,
      );
    });
  }
  return;
};

export const buildArrayUniqueItemsClause: GuardClauseFactory = function* (
  param,
  rule,
  errorType,
  service,
  options,
  typeName,
) {
  if (rule.id === 'array-unique-items') {
    const conditions = buildConditions(typeName, param, (name: string) => [
      `${buildName(typeName, name)}.is_a?(Numeric)`,
      `${must(param, buildName(typeName, name))}.length != ${must(
        param,
        buildName(typeName, name),
      )}.uniq.length`,
    ]);

    yield '';
    yield `# ${rule.id}`;
    yield* block(`if ${conditions.join(' && ')}`, function* () {
      yield* buildError(
        rule.id,
        `"${buildName(typeName, param.name.value)}" must contain unique values`,
        buildName(typeName, param.name.value),
        errorType,
      );
    });
  }
  return;
};

export const ruleFactories: GuardClauseFactory[] = [
  buildStringMaxLengthClause,
  buildStringMinLengthClause,
  buildStringPatternClause,
  buildNumberMultipleOfClause,
  buildNumberGreaterThanClause,
  buildNumberGreaterOrEqualClause,
  buildNumberLessThanClause,
  buildNumberLessOrEqualClause,
  buildArrayMaxItemsClause,
  buildArrayMinItemsClause,
  buildArrayUniqueItemsClause,
];
