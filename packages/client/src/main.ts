import { PACKAGE_NAME } from './index';

const root = document.querySelector('#app');
if (root) {
  root.textContent = PACKAGE_NAME;
}
