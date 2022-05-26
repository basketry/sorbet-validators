import {
  Method,
  Parameter,
  Property,
  ReturnType,
  Service,
  Type,
} from 'basketry';
import { pascal, snake } from 'case';

import { SorbetOptions } from '@basketry/sorbet/lib/types';
import {
  buildEnumNamespace,
  buildNamespace,
  buildTypeNamespace,
} from '@basketry/sorbet/lib/name-factory';

export function buildFullyQualifiedType(
  type: Type,
  service: Service,
  options?: SorbetOptions,
): string {
  return `${buildTypeNamespace(service, options)}::${pascal(type.name.value)}`;
}

export function buildFullyQualifiedValidationErrorType(
  service: Service,
  options?: SorbetOptions,
): string {
  return `${buildValidationErrorNamespace(
    service,
    options,
  )}::${buildValidationErrorName()}`;
}
export function buildValidationErrorName(): string {
  return pascal(`validation_error`);
}
export function buildValidationErrorNamespace(
  service: Service,
  options?: SorbetOptions,
): string {
  return buildNamespace(options?.sorbet?.typesModule, service, options);
}
export function buildValidationErrorFilepath(
  service: Service,
  options?: SorbetOptions,
): string[] {
  const namespace = buildValidationErrorNamespace(service, options);

  return [
    ...namespace.split('::').map(snake),
    `${snake(buildValidationErrorName())}.rb`,
  ];
}

export function buildValidatorsName(): string {
  return pascal(`validators`);
}
export function buildValidatorsNamespace(
  service: Service,
  options?: SorbetOptions,
): string {
  return buildNamespace(options?.sorbet?.interfacesModule, service, options);
}
export function buildValidatorsFilepath(
  service: Service,
  options?: SorbetOptions,
): string[] {
  const namespace = buildValidatorsNamespace(service, options);

  return [
    ...namespace.split('::').map(snake),
    `${snake(buildValidatorsName())}.rb`,
  ];
}

export function buildMethodValidatorName(method: Method): string {
  return snake(`validate_${snake(method.name.value)}_parameters`);
}

export function buildTypeName(
  type: Parameter | Property | ReturnType,
  service: Service,
  options: SorbetOptions | undefined,
  skipArrayify: boolean = false,
): string {
  const arrayify = (n: string) =>
    type.isArray && !skipArrayify ? `T::Array[${n}]` : n;

  if (type.isUnknown) {
    return arrayify('T.untyped');
  } else if (type.isLocal) {
    let moduleNamespace: string;
    if (service.types.some((t) => t.name.value === type.typeName.value)) {
      moduleNamespace = buildTypeNamespace(service, options);
    } else {
      moduleNamespace = buildEnumNamespace(service, options);
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
