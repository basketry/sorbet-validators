import {
  Enum,
  File,
  Generator,
  isRequired,
  Literal,
  Method,
  Parameter,
  Property,
  ReturnType,
  Service,
  Type,
} from 'basketry';
import { constant, pascal, snake } from 'case';

import { block, from, indent } from './utils';

import { SorbetOptions } from '@basketry/sorbet/lib/types';
import {
  buildEnumNamespace,
  buildTypeName,
  buildParameterName,
} from '@basketry/sorbet/lib/name-factory';
import { warning } from '@basketry/sorbet/lib/warning';
import {
  buildFullyQualifiedValidationErrorType,
  buildMethodValidatorName,
  buildValidationErrorFilepath,
  buildValidationErrorName,
  buildValidatorsFilepath,
  buildValidatorsName,
  buildValidatorsNamespace,
} from './name-factory';
import { buildFullyQualifiedType, buildValidationErrorNamespace } from '.';
import {
  buildError,
  ruleFactories,
  rulelessFactories,
} from './guard-clause-factories';
import { SorbetValidatorOptions } from './types';

const errorArrayName = snake('validator_internal_errors');

export const generateTypes: Generator = (
  service,
  options?: SorbetValidatorOptions,
) => {
  return new Builder(service, options).build();
};

class Builder {
  constructor(
    private readonly service: Service,
    private readonly options?: SorbetValidatorOptions,
  ) {}

  build(): File[] {
    // const typeFiles = this.service.types.map((type) =>
    //   this.buildTypeFile(type),
    // );

    // const enumFiles = this.service.enums.map((e) => this.buildEnumFile(e));

    return [
      this.buildValidationErrorFile(),
      this.buildValidatorsFile(),
      // ...interfaceFiles,
      //  ...typeFiles,
      // ...enumFiles,
    ];
  }

  private *comment(
    text: string | Literal<string> | Literal<string>[] | undefined,
  ): Iterable<string> {
    if (Array.isArray(text)) {
      for (const line of text) yield* this.comment(line);
    } else if (typeof text === 'string') {
      yield `# ${text}`;
    } else if (text) {
      yield `# ${text.value}`;
    }
  }

  private buildValidationErrorFile(): File {
    return {
      path: buildValidationErrorFilepath(this.service, this.options),
      contents: from(this.buildValidationError()),
    };
  }

  private *buildValidationError(): Iterable<string> {
    yield warning(this.service, require('../package.json'));
    yield '';

    yield '# typed: strict';
    yield '';

    if (this.options?.sorbet?.fileIncludes?.length) {
      for (const include of this.options.sorbet.fileIncludes) {
        yield `require '${include}'`;
      }
      yield '';
    }

    yield* block(
      `module ${buildValidationErrorNamespace(this.service, this.options)}`,
      function* () {
        yield* block(
          `class ${buildValidationErrorName()} < T::Struct`,
          function* () {
            yield 'const :code, T.nilable(String)';
            yield 'const :title, T.nilable(String)';
            yield 'const :path, T.nilable(String)';
          },
        );
      },
    );

    yield '';
  }

  private buildValidatorsFile(): File {
    return {
      path: buildValidatorsFilepath(this.service, this.options),
      contents: from(this.buildValidators()),
    };
  }

  private *buildValidators(): Iterable<string> {
    const self = this;
    const methods = this.service.interfaces.flatMap((i) => i.methods);

    yield warning(this.service, require('../package.json'));
    yield '';

    yield '# typed: strict';
    yield '';

    if (this.options?.sorbet?.rubocopDisable?.length) {
      for (const rule of this.options?.sorbet?.rubocopDisable) {
        yield `# rubocop:disable ${rule}`;
      }
      yield '';
    }

    if (this.options?.sorbet?.fileIncludes?.length) {
      for (const include of this.options.sorbet.fileIncludes) {
        yield `require '${include}'`;
      }
      yield '';
    }

    yield* block(
      `module ${buildValidatorsNamespace(this.service, this.options)}`,
      function* () {
        yield* block(`module ${buildValidatorsName()}`, function* () {
          yield 'extend T::Sig';
          for (const method of methods) {
            if (!method.parameters.length) continue;
            yield '';
            yield* self.buildMethodParamsValidator(method);
          }

          for (const type of self.service.types) {
            if (!type.properties.length) continue;
            yield '';
            yield* self.buildTypeValidator(type);
          }

          for (const e of self.service.enums) {
            yield '';
            yield* self.buildEnumValidator(e);
          }
        });
      },
    );

    if (this.options?.sorbet?.rubocopDisable?.length) {
      yield '';
      for (const rule of this.options?.sorbet?.rubocopDisable) {
        yield `# rubocop:enable ${rule}`;
      }
    }

    yield '';
  }

  private *buildMethodParamsValidator(method: Method): Iterable<string> {
    const self = this;
    const errorType = buildFullyQualifiedValidationErrorType(
      this.service,
      this.options,
    );

    yield* this.buildSignature(method.parameters);

    yield* block(
      `def ${buildMethodValidatorName(method)}(${method.parameters
        .map((param) => `${buildParameterName(param)}:`)
        .join(', ')})`,
      function* () {
        yield `${errorArrayName} = T.let([], T::Array[${errorType}])`;
        for (const param of method.parameters) {
          for (const factory of rulelessFactories) {
            yield* factory(param, errorType, self.service, self.options);
          }
          for (const rule of param.rules) {
            for (const factory of ruleFactories) {
              yield* factory(
                param,
                rule,
                errorType,
                self.service,
                self.options,
              );
            }
          }
        }
        yield '';
        yield `${errorArrayName}`;
      },
    );
  }

  private *buildTypeValidator(type: Type): Iterable<string> {
    const self = this;
    const errorType = buildFullyQualifiedValidationErrorType(
      this.service,
      this.options,
    );

    const params = `${snake(type.name.value)}: ${buildFullyQualifiedType(
      type,
      this.service,
      this.options,
    )}`;

    yield* block('sig do', function* () {
      yield `params(${params}).`;
      yield* indent(`returns(T::Array[${errorType}])`);
    });
    yield* block(
      `def ${snake(`validate_${snake(type.name.value)}`)}(${snake(
        type.name.value,
      )})`,
      function* () {
        yield `${errorArrayName} = T.let([], T::Array[${errorType}])`;

        for (const property of type.properties) {
          for (const factory of rulelessFactories) {
            yield* factory(
              property,
              errorType,
              self.service,
              self.options,
              snake(type.name.value),
            );
          }
          for (const rule of property.rules) {
            for (const factory of ruleFactories) {
              yield* factory(
                property,
                rule,
                errorType,
                self.service,
                self.options,
                snake(type.name.value),
              );
            }
          }
        }

        yield '';
        yield `${errorArrayName}`;
      },
    );
  }

  private *buildEnumValidator(e: Enum): Iterable<string> {
    const self = this;
    const errorType = buildFullyQualifiedValidationErrorType(
      this.service,
      this.options,
    );

    const params = `${snake(e.name.value)}: ${buildEnumNamespace(
      this.service,
      this.options,
    )}::${pascal(e.name.value)}`;

    yield* block(`sig do`, function* () {
      yield `params(${params}).`;
      yield* indent(`returns(T::Array[${errorType}])`);
    });

    yield* block(
      `def ${snake(`validate_${snake(e.name.value)}`)}(${snake(e.name.value)})`,
      function* () {
        if (self.options?.sorbet?.runtime !== false) {
          yield `case T.unsafe(${snake(e.name.value)})`;
          yield 'when';
          yield* indent(function* () {
            for (let i = 0; i < e.values.length; i++) {
              const value = e.values[i];
              yield `${buildEnumNamespace(
                self.service,
                self.options,
              )}::${pascal(e.name.value)}::${constant(value.value)}${
                i === e.values.length - 1 ? '' : ','
              }`;
            }
            yield `[]`;
          });
          yield 'else';
          yield* indent(function* () {
            yield '[';
            yield* indent(
              buildError(
                'ENUM',
                `"${snake(
                  e.name.value,
                )}" must be a member of \`${buildEnumNamespace(
                  self.service,
                  self.options,
                )}::${pascal(e.name.value)}\``,
                '# TODO',
                errorType,
                { skipPush: true, trailingComma: true },
              ),
            );
            yield ']';
          });
          yield 'end';
        } else {
          yield '[]';
        }
      },
    );
  }

  private *buildSignature(parameters: Parameter[]): Iterable<string> {
    const self = this;
    const errorType = buildFullyQualifiedValidationErrorType(
      this.service,
      this.options,
    );

    yield* block('sig do', function* () {
      yield 'params(';
      yield* indent(
        parameters.map((param, i) => {
          const comma = i === parameters.length - 1 ? '' : ',';
          const typeName = self.buildTypeName({
            type: param,
          });
          const nilableTypeName = isRequired(param)
            ? typeName
            : `T.nilable(${typeName})`;

          return `${buildParameterName(param)}: ${nilableTypeName}${comma}`;
        }),
      );
      yield `).returns(`;
      yield* indent(`T::Array[${errorType}]`);
      yield `)`;
    });
  }

  private buildTypeName({
    type,
    skipArrayify = false,
  }: {
    type: Parameter | Property | ReturnType;
    skipArrayify?: boolean;
  }): string {
    return buildTypeName({
      type,
      service: this.service,
      options: this.options,
      skipArrayify,
    });
  }
}
