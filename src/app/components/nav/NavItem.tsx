import classNames from 'classnames';
import React, { ComponentProps, createContext, forwardRef, useContext } from 'react';
import { Link } from 'react-router-dom';
import { as } from 'folds';
import * as css from './styles.css';

const NavSelectionContext = createContext(false);

export const NavItem = as<
  'div',
  {
    highlight?: boolean;
  } & css.RoomSelectorVariants
>(
  (
    {
      as: AsNavItem = 'div',
      className,
      highlight,
      variant,
      radii,
      children,
      'aria-selected': selected,
      ...props
    },
    ref
  ) => (
    <NavSelectionContext.Provider value={selected === true || selected === 'true'}>
      <AsNavItem
        className={classNames(css.NavItem({ variant, radii }), className)}
        data-highlight={highlight}
        data-selected={selected}
        {...props}
        ref={ref}
      >
        {children}
      </AsNavItem>
    </NavSelectionContext.Provider>
  )
);

export const NavLink = forwardRef<HTMLAnchorElement, ComponentProps<typeof Link>>(
  ({ className, ...props }, ref) => {
    const selected = useContext(NavSelectionContext);
    return (
      <Link
        className={classNames(css.NavLink, className)}
        aria-current={selected ? 'page' : undefined}
        {...props}
        ref={ref}
      />
    );
  }
);

export const NavButton = as<'button'>(
  ({ as: AsNavButton = 'button', className, ...props }, ref) => {
    const selected = useContext(NavSelectionContext);
    return (
      <AsNavButton
        className={classNames(css.NavLink, className)}
        aria-current={selected ? 'page' : undefined}
        {...props}
        ref={ref}
      />
    );
  }
);
