/* Jest setup that needs the test framework (setupFilesAfterEnv): Testing Library's options. */

// A full parallel run keeps every core busy: findBy and waitFor get 5 s instead of 1 s, so a
// screen that's merely slow under load doesn't fail (the Today screen's running-late preview did,
// now and then; friends and chat step 10). A real failure still fails, only later.
require('@testing-library/react-native').configure({ asyncUtilTimeout: 5000 });
