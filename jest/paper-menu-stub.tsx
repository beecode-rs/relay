import { type JSX, type ReactNode } from 'react';
import { View } from 'react-native';

type PaperModule = typeof import('react-native-paper');

interface MenuStubProps {
  anchor: ReactNode;
  children?: ReactNode;
  onDismiss?: () => void;
  visible?: boolean;
}

const createMenuStub = (menuItem: PaperModule['Menu']['Item']) => {
  const MenuStub = ({ anchor, children, visible }: MenuStubProps): JSX.Element => {
    return (
      <View>
        {anchor}
        {visible === true && <View>{children}</View>}
      </View>
    );
  };

  return Object.assign(MenuStub, { Item: menuItem });
};

export const createPaperModuleWithMenuStub = (): PaperModule => {
  const actual = jest.requireActual<PaperModule>('react-native-paper');

  return { ...actual, Menu: createMenuStub(actual.Menu.Item) as unknown as PaperModule['Menu'] };
};
