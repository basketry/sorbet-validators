import {
  Enum,
  File,
  Generator,
  Interface,
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

import { SorbetOptions } from '@basketry/sorbet/lib/types';
import {
  buildEnumNamespace,
  buildInterfaceNamespace,
  buildTypeNamespace,
  buildParameterName,
} from '@basketry/sorbet/lib/name-factory';
import { warning } from './warning';
import {
  buildFullyQualifiedValidationErrorType,
  buildMethodValidatorName,
  buildValidationErrorFilepath,
  buildValidationErrorName,
  buildValidatorsFilepath,
  buildValidatorsName,
  buildValidatorsNamespace,
} from './name-factory';

export const generateTypes: Generator = (service, options?: SorbetOptions) => {
  return new Builder(service, options).build();
};

class Builder {
  constructor(
    private readonly service: Service,
    private readonly options?: SorbetOptions,
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
    yield warning;
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
      `module ${buildInterfaceNamespace(this.service, this.options)}`,
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

    yield warning;
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
      `module ${buildValidatorsNamespace(this.service, this.options)}`,
      function* () {
        yield* block(`module ${buildValidatorsName()}`, function* () {
          yield 'extend T::Sig';
          yield '';
          for (const method of methods) {
            if (!method.parameters.length) continue;
            yield '';
            yield* self.buildMethodParamsValidator(method);
          }
        });
      },
    );

    yield '';
  }

  private *buildMethodParamsValidator(method: Method): Iterable<string> {
    yield* this.buildSignature(method.parameters);

    yield* block(`def ${buildMethodValidatorName(method)}(**kwargs)`, []);

    // yield `${prefix(indent)}def ${snake(
    //   `validate_${snake(method.name)}_params`,
    // )}${buildMethodParams(method)}`;
    // yield `${prefix(
    //   indent + 1,
    // )}errors = T.let([], T::Array[${buildModuleNamespace(
    //   service,
    // )}::ValidationError])`;
    // const moduleNamespace = buildModuleNamespace(service);

    // for (const param of method.parameters) {
    //   for (const factory of rulelessFactories) {
    //     yield* factory(param, moduleNamespace, errorType, indent + 1);
    //   }
    //   for (const rule of param.rules) {
    //     for (const factory of ruleFactories) {
    //       yield* factory(param, rule, moduleNamespace, errorType, indent + 1);
    //     }
    //   }
    // }
    // yield '';
    // yield `${prefix(indent + 1)}errors`;
    // yield `${prefix(indent)}end`;
  }

  private *buildSignature(parameters: Parameter[]): Iterable<string> {
    const self = this;
    const errorType = buildFullyQualifiedValidationErrorType(
      this.service,
      this.options,
    );

    yield* block('sig do', function* () {
      yield 'abstract.params(';
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
    const arrayify = (n: string) =>
      type.isArray && !skipArrayify ? `T::Array[${n}]` : n;

    if (type.isUnknown) {
      return arrayify('T.untyped');
    } else if (type.isLocal) {
      let moduleNamespace: string;
      if (
        this.service.types.some((t) => t.name.value === type.typeName.value)
      ) {
        moduleNamespace = buildTypeNamespace(this.service, this.options);
      } else {
        moduleNamespace = buildEnumNamespace(this.service, this.options);
      }

      return arrayify(`${moduleNamespace}::${pascal(type.typeName.value)}`);
    }

    switch (type.typeName.value) {
      case 'string':
        return arrayify('String');
      case 'number':
        return arrayify('Numeric');
      case 'integer':
        return arrayify('Integer');
      case 'boolean':
        return arrayify('T::Boolean');
      default:
        return arrayify('T.untyped');
    }
  }

  // private buildInterfaceFile(int: Interface): File {
  //   return {
  //     path: buildInterfaceFilepath(int, this.service, this.options),
  //     contents: from(this.buildInterface(int)),
  //   };
  // }

  // private *buildInterface(int: Interface): Iterable<string> {
  //   const self = this;
  //   yield warning;
  //   yield '';

  //   yield '# typed: strict';
  //   yield '';

  //   if (this.options?.sorbet?.fileIncludes?.length) {
  //     for (const include of this.options.sorbet.fileIncludes) {
  //       yield `require '${include}'`;
  //     }
  //     yield '';
  //   }

  //   yield* this.comment(int.description);
  //   yield* block(
  //     `module ${buildInterfaceNamespace(this.service, this.options)}`,
  //     block(`module ${buildInterfaceName(int)}`, function* () {
  //       yield 'extend T::Sig';
  //       yield 'extend T::Helpers';
  //       yield '';
  //       yield 'interface!';
  //       for (const method of int.methods) {
  //         yield '';
  //         yield* self.comment(method.description);
  //         yield* self.buildSignature(method);
  //         yield* self.buildDefinition(method);
  //       }
  //     }),
  //   );

  //   yield '';
  // }

  // private *buildSignature(method: Method): Iterable<string> {
  //   const self = this;

  //   if (method.returnType) {
  //     const typeName = self.buildTypeName({ type: method.returnType! });
  //     const returnType = isRequired(method.returnType!)
  //       ? typeName
  //       : `T.nilable(${typeName})`;

  //     if (method.parameters.length) {
  //       yield* block('sig do', function* () {
  //         yield 'abstract.params(';
  //         yield* self.buildSignatureParameters(method);
  //         yield `).returns(`;
  //         yield* indent(returnType);
  //         yield `)`;
  //       });
  //     } else {
  //       yield `sig { abstract.returns(${returnType}) }`;
  //     }
  //   } else {
  //     if (method.parameters.length) {
  //       yield* block('sig do', function* () {
  //         yield 'abstract.params(';
  //         yield* self.buildSignatureParameters(method);
  //         yield ').void';
  //       });
  //     } else {
  //       yield 'sig { abstract.void }';
  //     }
  //   }
  // }

  // private *buildSignatureParameters(method: Method): Iterable<string> {
  //   yield* indent(
  //     method.parameters.map((param, i) => {
  //       const comma = i === method.parameters.length - 1 ? '' : ',';
  //       const typeName = this.buildTypeName({
  //         type: param,
  //       });
  //       const nilableTypeName = isRequired(param)
  //         ? typeName
  //         : `T.nilable(${typeName})`;

  //       return `${buildParameterName(param)}: ${nilableTypeName}${comma}`;
  //     }),
  //   );
  // }

  // private *buildDefinition(method: Method): Iterable<string> {
  //   const parameters = method.parameters.length
  //     ? `(${method.parameters
  //         .map((param) => `${buildParameterName(param)}:`)
  //         .join(', ')})`
  //     : '';

  //   yield* block(`def ${buildMethodName(method)}${parameters}`, []);
  // }

  // private buildTypeFile(type: Type): File {
  //   return {
  //     path: buildTypeFilepath(type, this.service, this.options),
  //     contents: from(this.buildType(type)),
  //   };
  // }

  // private *buildType(type: Type): Iterable<string> {
  //   const self = this;
  //   yield warning;
  //   yield '';

  //   yield '# typed: strict';
  //   yield '';

  //   if (this.options?.sorbet?.fileIncludes?.length) {
  //     for (const include of this.options.sorbet.fileIncludes) {
  //       yield `require '${include}'`;
  //     }
  //     yield '';
  //   }

  //   yield* block(
  //     `module ${buildTypeNamespace(this.service, this.options)}`,
  //     function* () {
  //       yield* self.comment(type.description);
  //       yield* block(
  //         `class ${pascal(type.name.value)} < T::Struct`,
  //         function* () {
  //           let isFirst = true;
  //           for (const property of type.properties) {
  //             const typeName = self.buildTypeName({
  //               type: property,
  //             });

  //             if (!isFirst && property.description) yield '';
  //             yield* self.comment(property.description);
  //             yield `const :${buildPropertyName(property)}, ${
  //               isRequired(property) ? typeName : `T.nilable(${typeName})`
  //             }`;
  //             isFirst = false;
  //           }
  //         },
  //       );
  //     },
  //   );

  //   yield '';
  // }

  // private buildEnumFile(e: Enum): File {
  //   return {
  //     path: buildEnumFilepath(e, this.service, this.options),
  //     contents: from(this.buildEnum(e)),
  //   };
  // }

  // private *buildEnum(e: Enum): Iterable<string> {
  //   yield warning;
  //   yield '';

  //   yield '# typed: strict';
  //   yield '';

  //   if (this.options?.sorbet?.fileIncludes?.length) {
  //     for (const include of this.options.sorbet.fileIncludes) {
  //       yield `require '${include}'`;
  //     }
  //     yield '';
  //   }

  //   yield* block(
  //     `module ${buildEnumNamespace(this.service, this.options)}`,
  //     block(
  //       `class ${pascal(e.name.value)} < T::Enum`,
  //       block(`enums do`, function* () {
  //         for (const value of e.values) {
  //           yield `${constant(value.value)} = new('${snake(value.value)}')`;
  //         }
  //       }),
  //     ),
  //   );

  //   yield '';
  // }

  // private buildTypeName({
  //   type,
  //   skipArrayify = false,
  // }: {
  //   type: Parameter | Property | ReturnType;
  //   skipArrayify?: boolean;
  // }): string {
  //   const arrayify = (n: string) =>
  //     type.isArray && !skipArrayify ? `T::Array[${n}]` : n;

  //   if (type.isUnknown) {
  //     return arrayify('T.untyped');
  //   } else if (type.isLocal) {
  //     let moduleNamespace: string;
  //     if (
  //       this.service.types.some((t) => t.name.value === type.typeName.value)
  //     ) {
  //       moduleNamespace = buildTypeNamespace(this.service, this.options);
  //     } else {
  //       moduleNamespace = buildEnumNamespace(this.service, this.options);
  //     }

  //     return arrayify(`${moduleNamespace}::${pascal(type.typeName.value)}`);
  //   }

  //   switch (type.typeName.value) {
  //     case 'string':
  //       return arrayify('String');
  //     case 'number':
  //       return arrayify('Numeric');
  //     case 'integer':
  //       return arrayify('Integer');
  //     case 'boolean':
  //       return arrayify('T::Boolean');
  //     default:
  //       return arrayify('T.untyped');
  //   }
  // }
}

function from(lines: Iterable<string>): string {
  return Array.from(lines).join('\n');
}

let indentCount = 0;

function* block(
  line: string,
  body: string | Iterable<string> | (() => Iterable<string>),
): Iterable<string> {
  yield line;
  yield* indent(body);
  yield 'end';
}

function* indent(
  lines: string | Iterable<string> | (() => Iterable<string>),
): Iterable<string> {
  try {
    indentCount++;
    for (const line of typeof lines === 'function'
      ? lines()
      : typeof lines === 'string'
      ? [lines]
      : lines) {
      yield line.trim().length
        ? `${'  '.repeat(indentCount)}${line.trim()}`
        : '';
    }
  } finally {
    indentCount--;
  }
}
