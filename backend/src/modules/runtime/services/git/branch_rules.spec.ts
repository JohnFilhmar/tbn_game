import {
  department_prefix,
  feature_branch_name,
  is_department_feature_branch,
  is_protected_branch,
  manager_branch_name,
  slugify,
} from './branch_rules';

describe('branch rules', () => {
  it('names branches in the manager namespace', () => {
    expect(slugify('Alice Smith')).toBe('alice-smith');
    expect(slugify('  --Ünïcode!! ')).toBe('n-code');
    expect(slugify('***')).toBe('agent');
    expect(slugify('a'.repeat(60))).toHaveLength(40);
    expect(department_prefix('Alice')).toBe('alice');
    expect(manager_branch_name('Alice')).toBe('alice/main');
    expect(feature_branch_name('Alice', 'Add the login page!', 'ab12cd')).toBe(
      'alice/add-the-login-page-ab12cd',
    );
  });

  it('tells department feature branches from the manager branch and others', () => {
    expect(is_department_feature_branch('alice/add-login-ab12cd', 'Alice')).toBe(true);
    expect(is_department_feature_branch('alice/main', 'Alice')).toBe(false);
    expect(is_department_feature_branch('bob/add-login-ab12cd', 'Alice')).toBe(false);
    expect(is_department_feature_branch('development', 'Alice')).toBe(false);
    expect(is_department_feature_branch('alicex/thing', 'Alice')).toBe(false);
  });

  it('protects development, staging and the default branch', () => {
    expect(is_protected_branch('development', 'main')).toBe(true);
    expect(is_protected_branch('staging', 'main')).toBe(true);
    expect(is_protected_branch('main', 'main')).toBe(true);
    expect(is_protected_branch('trunk', 'trunk')).toBe(true);
    expect(is_protected_branch('alice/main', 'main')).toBe(false);
  });
});
