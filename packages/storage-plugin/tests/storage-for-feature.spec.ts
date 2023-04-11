import { BrowserModule } from '@angular/platform-browser';
import { RouterModule, Router } from '@angular/router';
import { State, NgxsModule, Store } from '@ngxs/store';
import { Component, Injectable, NgModule, NgZone } from '@angular/core';
import { freshPlatform, skipConsoleLogging } from '@ngxs/store/internals/testing';
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import { APP_BASE_HREF } from '@angular/common';

import { NgxsStoragePluginModule } from '..';
import { provide__feature_storage_state } from '../src/storage.module';

describe('forFeature', () => {
  interface CounterStateModel {
    count: number;
  }

  @State<CounterStateModel>({
    name: 'counter',
    defaults: { count: 0 }
  })
  @Injectable()
  class CounterState {}

  interface BlogStateModel {
    pages: number[];
  }

  @State<BlogStateModel>({
    name: 'blog',
    defaults: { pages: [] }
  })
  @Injectable()
  class BlogState {}

  @Component({ template: 'This is blog' })
  class BlogComponent {}

  @NgModule({
    imports: [
      RouterModule.forChild([{ path: '', component: BlogComponent }]),
      NgxsModule.forFeature([BlogState])
    ],
    declarations: [BlogComponent]
  })
  class BlogModule {}

  @Component({
    selector: 'app-root',
    template: '<router-outlet></router-outlet>'
  })
  class TestComponent {}

  @NgModule({
    imports: [
      BrowserModule,
      RouterModule.forRoot(
        [
          {
            path: 'blog',
            providers: [provide__feature_storage_state([BlogState])],
            loadChildren: () => BlogModule
          }
        ],
        {
          initialNavigation: 'disabled'
        }
      ),
      NgxsModule.forRoot([CounterState]),
      NgxsStoragePluginModule.forRoot({
        key: [CounterState]
      })
    ],
    declarations: [TestComponent],
    bootstrap: [TestComponent],
    providers: [{ provide: APP_BASE_HREF, useValue: '/' }]
  })
  class TestModule {}

  it(
    'should de-serialize the state when provided through forFeature',
    freshPlatform(async () => {
      // Arrange
      localStorage.setItem('counter', JSON.stringify({ counter: { count: 100 } }));
      localStorage.setItem('blog', JSON.stringify({ pages: [1, 2, 3] }));

      const { injector } = await skipConsoleLogging(() =>
        platformBrowserDynamic().bootstrapModule(TestModule)
      );
      const router = injector.get(Router);
      const ngZone = injector.get(NgZone);
      const store = injector.get(Store);
      // Act
      await ngZone.run(() => router.navigateByUrl('/blog'));
      // Assert
      expect(store.snapshot().blog).toEqual({ pages: [1, 2, 3] });
    })
  );
});
