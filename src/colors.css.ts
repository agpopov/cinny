import { createTheme } from '@vanilla-extract/css';
import { color } from 'folds';

const silverThemeData = {
  Background: {
    Container: '#DEDEDE',
    ContainerHover: '#D3D3D3',
    ContainerActive: '#C7C7C7',
    ContainerLine: '#BBBBBB',
    OnContainer: '#000000',
  },

  Surface: {
    Container: '#EAEAEA',
    ContainerHover: '#DEDEDE',
    ContainerActive: '#D3D3D3',
    ContainerLine: '#C7C7C7',
    OnContainer: '#000000',
  },

  SurfaceVariant: {
    Container: '#DEDEDE',
    ContainerHover: '#D3D3D3',
    ContainerActive: '#C7C7C7',
    ContainerLine: '#BBBBBB',
    OnContainer: '#000000',
  },

  Primary: {
    Main: '#1245A8',
    MainHover: '#103E97',
    MainActive: '#0F3B8F',
    MainLine: '#0E3786',
    OnMain: '#FFFFFF',
    Container: '#C4D0E9',
    ContainerHover: '#B8C7E5',
    ContainerActive: '#ACBEE1',
    ContainerLine: '#A0B5DC',
    OnContainer: '#0D3076',
  },

  Secondary: {
    Main: '#000000',
    MainHover: '#171717',
    MainActive: '#232323',
    MainLine: '#2F2F2F',
    OnMain: '#EAEAEA',
    Container: '#C7C7C7',
    ContainerHover: '#BBBBBB',
    ContainerActive: '#AFAFAF',
    ContainerLine: '#A4A4A4',
    OnContainer: '#0C0C0C',
  },

  Success: {
    Main: '#017343',
    MainHover: '#01683C',
    MainActive: '#016239',
    MainLine: '#015C36',
    OnMain: '#FFFFFF',
    Container: '#BFDCD0',
    ContainerHover: '#B3D5C7',
    ContainerActive: '#A6CEBD',
    ContainerLine: '#99C7B4',
    OnContainer: '#01512F',
  },

  Warning: {
    Main: '#864300',
    MainHover: '#793C00',
    MainActive: '#723900',
    MainLine: '#6B3600',
    OnMain: '#FFFFFF',
    Container: '#E1D0BF',
    ContainerHover: '#DBC7B2',
    ContainerActive: '#D5BDA6',
    ContainerLine: '#CFB499',
    OnContainer: '#5E2F00',
  },

  Critical: {
    Main: '#9D0F0F',
    MainHover: '#8D0E0E',
    MainActive: '#850D0D',
    MainLine: '#7E0C0C',
    OnMain: '#FFFFFF',
    Container: '#E7C3C3',
    ContainerHover: '#E2B7B7',
    ContainerActive: '#DDABAB',
    ContainerLine: '#D89F9F',
    OnContainer: '#6E0B0B',
  },

  Other: {
    FocusRing: 'rgba(0 0 0 / 50%)',
    Shadow: 'rgba(0 0 0 / 20%)',
    Overlay: 'rgba(0 0 0 / 50%)',
  },
};

export const silverTheme = createTheme(color, silverThemeData);

const darkThemeData = {
  Background: {
    Container: '#1A1A1A',
    ContainerHover: '#262626',
    ContainerActive: '#333333',
    ContainerLine: '#404040',
    OnContainer: '#F2F2F2',
  },

  Surface: {
    Container: '#262626',
    ContainerHover: '#333333',
    ContainerActive: '#404040',
    ContainerLine: '#4D4D4D',
    OnContainer: '#F2F2F2',
  },

  SurfaceVariant: {
    Container: '#333333',
    ContainerHover: '#404040',
    ContainerActive: '#4D4D4D',
    ContainerLine: '#595959',
    OnContainer: '#F2F2F2',
  },

  Primary: {
    Main: '#BDB6EC',
    MainHover: '#B2AAE9',
    MainActive: '#ADA3E8',
    MainLine: '#A79DE6',
    OnMain: '#2C2843',
    Container: '#413C65',
    ContainerHover: '#494370',
    ContainerActive: '#50497B',
    ContainerLine: '#575086',
    OnContainer: '#E3E1F7',
  },

  Secondary: {
    Main: '#FFFFFF',
    MainHover: '#E5E5E5',
    MainActive: '#D9D9D9',
    MainLine: '#CCCCCC',
    OnMain: '#1A1A1A',
    Container: '#404040',
    ContainerHover: '#4D4D4D',
    ContainerActive: '#595959',
    ContainerLine: '#666666',
    OnContainer: '#F2F2F2',
  },

  Success: {
    Main: '#85E0BA',
    MainHover: '#70DBAF',
    MainActive: '#66D9A9',
    MainLine: '#5CD6A3',
    OnMain: '#0F3D2A',
    Container: '#175C3F',
    ContainerHover: '#1A6646',
    ContainerActive: '#1C704D',
    ContainerLine: '#1F7A54',
    OnContainer: '#CCF2E2',
  },

  Warning: {
    Main: '#E3BA91',
    MainHover: '#DFAF7E',
    MainActive: '#DDA975',
    MainLine: '#DAA36C',
    OnMain: '#3F2A15',
    Container: '#5E3F20',
    ContainerHover: '#694624',
    ContainerActive: '#734D27',
    ContainerLine: '#7D542B',
    OnContainer: '#F3E2D1',
  },

  Critical: {
    Main: '#E69D9D',
    MainHover: '#E28D8D',
    MainActive: '#E08585',
    MainLine: '#DE7D7D',
    OnMain: '#401C1C',
    Container: '#602929',
    ContainerHover: '#6B2E2E',
    ContainerActive: '#763333',
    ContainerLine: '#803737',
    OnContainer: '#F5D6D6',
  },

  Other: {
    FocusRing: 'rgba(255, 255, 255, 0.5)',
    Shadow: 'rgba(0, 0, 0, 1)',
    Overlay: 'rgba(0, 0, 0, 0.8)',
  },
};

export const darkTheme = createTheme(color, darkThemeData);

export const butterTheme = createTheme(color, {
  ...darkThemeData,
  Background: {
    Container: '#1A1916',
    ContainerHover: '#262621',
    ContainerActive: '#33322C',
    ContainerLine: '#403F38',
    OnContainer: '#FFFBDE',
  },

  Surface: {
    Container: '#262621',
    ContainerHover: '#33322C',
    ContainerActive: '#403F38',
    ContainerLine: '#4D4B43',
    OnContainer: '#FFFBDE',
  },

  SurfaceVariant: {
    Container: '#33322C',
    ContainerHover: '#403F38',
    ContainerActive: '#4D4B43',
    ContainerLine: '#59584E',
    OnContainer: '#FFFBDE',
  },

  Secondary: {
    Main: '#FFFBDE',
    MainHover: '#E5E2C8',
    MainActive: '#D9D5BD',
    MainLine: '#CCC9B2',
    OnMain: '#1A1916',
    Container: '#403F38',
    ContainerHover: '#4D4B43',
    ContainerActive: '#59584E',
    ContainerLine: '#666459',
    OnContainer: '#F2EED3',
  },
});

export const telegramTheme = createTheme(color, {
  ...silverThemeData,
  Background: {
    Container: '#FFFFFF',
    ContainerHover: '#F4F4F5',
    ContainerActive: '#EBEDF0',
    ContainerLine: '#E4E6EA',
    OnContainer: '#000000',
  },

  Surface: {
    Container: '#FFFFFF',
    ContainerHover: '#F4F4F5',
    ContainerActive: '#EBEDF0',
    ContainerLine: '#E4E6EA',
    OnContainer: '#000000',
  },

  SurfaceVariant: {
    Container: '#F1F3F5',
    ContainerHover: '#E8EBEE',
    ContainerActive: '#DFE3E7',
    ContainerLine: '#D5DADF',
    OnContainer: '#000000',
  },

  Primary: {
    Main: '#419FD9',
    MainHover: '#3A94CC',
    MainActive: '#358BC1',
    MainLine: '#3183B6',
    OnMain: '#FFFFFF',
    Container: '#E6F3FB',
    ContainerHover: '#D8ECF8',
    ContainerActive: '#CAE5F5',
    ContainerLine: '#BCDDF2',
    OnContainer: '#1B6A9E',
  },

  Secondary: {
    Main: '#000000',
    MainHover: '#1A1A1A',
    MainActive: '#262626',
    MainLine: '#333333',
    OnMain: '#FFFFFF',
    Container: '#E8EAED',
    ContainerHover: '#DFE1E5',
    ContainerActive: '#D5D8DC',
    ContainerLine: '#CBCED3',
    OnContainer: '#0C0C0C',
  },
});

// Telegram Desktop "Night" palette.
export const telegramDarkTheme = createTheme(color, {
  ...darkThemeData,
  Background: {
    Container: '#17212B',
    ContainerHover: '#202B36',
    ContainerActive: '#2B3846',
    ContainerLine: '#101921',
    OnContainer: '#F5F5F5',
  },

  Surface: {
    Container: '#17212B',
    ContainerHover: '#202B36',
    ContainerActive: '#2B3846',
    ContainerLine: '#101921',
    OnContainer: '#F5F5F5',
  },

  SurfaceVariant: {
    Container: '#242F3D',
    ContainerHover: '#2B3846',
    ContainerActive: '#32404F',
    ContainerLine: '#3A4959',
    OnContainer: '#F5F5F5',
  },

  Primary: {
    Main: '#5288C1',
    MainHover: '#5A92CC',
    MainActive: '#629BD6',
    MainLine: '#6AA4E0',
    OnMain: '#FFFFFF',
    Container: '#1E3A55',
    ContainerHover: '#22415F',
    ContainerActive: '#264869',
    ContainerLine: '#2A4F73',
    OnContainer: '#D6E6F5',
  },

  Secondary: {
    Main: '#F5F5F5',
    MainHover: '#E5E5E5',
    MainActive: '#D9D9D9',
    MainLine: '#CCCCCC',
    OnMain: '#17212B',
    Container: '#2B3846',
    ContainerHover: '#32404F',
    ContainerActive: '#3A4959',
    ContainerLine: '#435263',
    OnContainer: '#F5F5F5',
  },
});
