// in order for semver to accurately compare itself
// it must use the same class file that created the semver.parse object
// therefore we need one place to rule them all.
export { default } from 'semver';
